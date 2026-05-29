"""Gemini-based parser for pasted lead text.

Python mirror of the `parseLeadsFromEmail` Cloud Function in functions/index.js.
Takes any unstructured text (a single name, a numbered list, an email body,
copy-pasted spreadsheet rows) and returns a list of dicts with the same
schema email ingestion produces — so manual-add leads land in Firestore
looking just like email-ingested ones.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import structlog

log = structlog.get_logger()


_RESEARCH_PROMPT = """You are a sales-ops research assistant. The user just added a single lead with very little info — only a name (and possibly a hint of region or business type). Your job is to research this business online using Google Search and return a structured summary.

Lead seed:
{seed}

Use Google Search to find what this business does, where it is, and how to contact them. Acceptable sources: their own website, Google Maps listing, LinkedIn company page, Companies House, news articles, trade press, social media, Crunchbase, Yelp. If multiple distinct businesses match the name, choose the one most likely matching the seed hint; otherwise pick the most plausible UK match.

Return ONLY a valid JSON object with these fields (use null for anything you cannot find — do NOT invent):
{{
  "business_name": "the canonical name",
  "website": "https://... or null if no real site exists",
  "address": "full postal address or null",
  "phone": "+44... or null",
  "location_area": "neighbourhood / town name or null",
  "location_postcode": "UK postcode or null",
  "venue_category": "one of [cocktail_bar, wine_bar, italian_restaurant, gastropub, hotel_bar, bottle_shop, deli_farm_shop, events_catering, rtd, restaurant_groups, festival_operators, cookery_schools, corporate_gifting, membership_clubs, airlines_trains, subscription_boxes, film_tv_theatre, yacht_charter, luxury_food_retail, grocery, wholesaler] or null",
  "business_summary": "MAX 25 words: what they do, where, who they serve",
  "drinks_programme": "any cocktails / wines / spirits they're known for, semicolon separated, or null",
  "notes": "concrete details: founding story, target customers, region served, news mentions — null if nothing useful",
  "menu_fit": "one of [strong, moderate, weak, unknown] — strong = obvious cocktail/spirits-led on-trade venue or premium spirits buyer; weak = unrelated category"
}}

Important: if you genuinely cannot find this business, return {{"business_name": null}} and null for everything else. Don't fabricate."""


_PROMPT = """You are extracting venue/business lead data from a block of text pasted by a sales team.

Text content:
{content}

Extract every business / venue / website link mentioned. A URL alone (no name, no context) is still a valid lead. Bare domains like "www.mondosando.com" are URLs too — normalise to "https://www.mondosando.com".

For each lead, return:
- business_name (only if explicitly stated or clearly inferable; otherwise null)
- website (the venue's primary website URL, normalised to https://. null if only a social link is given. Use null rather than guessing — do not hallucinate URLs.)
- instagram_handle (an instagram.com URL if present, else null)
- phone (if present, null if not)
- address (if present, null if not)
- notes (any relevant context from the text — descriptions, region hints, why they matter — null if nothing useful)
- google_maps_url (if any URL is a Google Maps link, put it here instead of website)

Either business_name OR website OR instagram_handle MUST be present.

A pasted list item like "3. Best Wines (London): Despite the name, they are major spirit consultants" should yield {{"business_name": "Best Wines", "notes": "Major spirit consultants. Based in London.", ...}}.

Strip leading list markers ("3. ", "- ", "**", "•") and parenthetical region hints from business_name; keep that context in notes instead.

Do NOT invent URLs. If you don't know the website, leave website null.

Return ONLY a valid JSON array. Examples:
[
  {{"business_name":"The Copper Kettle","website":"https://copperkettle.co.uk","instagram_handle":null,"phone":null,"address":"12 High St, London","notes":null,"google_maps_url":null}},
  {{"business_name":"Best Wines","website":null,"instagram_handle":null,"phone":null,"address":null,"notes":"London — major spirit consultants for high-end bars","google_maps_url":null}}
]

If nothing useful found, return []."""


def research_lead_via_gemini(seed: str) -> dict[str, Any] | None:
    """Research a single business using Gemini + Google Search grounding.

    Pass any text the user has typed (name + optional context). Gemini uses
    its Google Search tool to find the business and returns a structured
    dict matching our enrichment schema. Returns None if the model can't
    find anything (or Gemini is unavailable).
    """
    seed = (seed or "").strip()
    if not seed:
        return None

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log.warning("research_no_api_key")
        return None

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        prompt = _RESEARCH_PROMPT.format(seed=seed[:1000])

        # Enable Google Search as a grounding tool so the model can fetch
        # real web pages instead of relying on training data alone.
        config = types.GenerateContentConfig(
            tools=[types.Tool(google_search=types.GoogleSearch())],
            temperature=0.1,
            max_output_tokens=2048,
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=config,
        )

        raw = (response.text or "").strip()
        raw = re.sub(r"```json\s*", "", raw)
        raw = raw.replace("```", "").strip()

        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            log.warning("research_no_json", raw=raw[:300])
            return None

        data = json.loads(raw[start:end + 1])
        if not isinstance(data, dict):
            return None

        # If the model returned an "I couldn't find this" payload, give up.
        if not data.get("business_name") and not data.get("website"):
            log.info("research_not_found", seed=seed[:80])
            return None

        # Normalise URL fields.
        for url_field in ("website",):
            v = data.get(url_field)
            if v and isinstance(v, str) and not re.match(r"^https?://", v, re.IGNORECASE):
                data[url_field] = "https://" + v.lstrip("/")

        log.info("research_done", seed=seed[:80], name=data.get("business_name"),
                 has_website=bool(data.get("website")))
        return data
    except Exception as exc:
        log.warning("research_failed", error=str(exc), seed=seed[:80])
        return None


def parse_leads_from_text(text: str) -> list[dict[str, Any]]:
    """Run Gemini over pasted text and return structured lead dicts.

    Returns an empty list when Gemini is unavailable or returns nothing
    parseable — callers should handle that by falling back to a literal
    single-lead from the raw input.
    """
    text = (text or "").strip()
    if not text:
        return []

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log.warning("text_lead_parser_no_api_key")
        return []

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        prompt = _PROMPT.format(content=text[:16000])
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"max_output_tokens": 4096, "temperature": 0.1},
        )
        raw = (response.text or "").strip()
        raw = re.sub(r"```json\s*", "", raw)
        raw = raw.replace("```", "").strip()

        start = raw.find("[")
        end = raw.rfind("]")
        if start < 0 or end <= start:
            log.warning("text_lead_parser_no_json", raw=raw[:300])
            return []

        parsed = json.loads(raw[start:end + 1])
        if not isinstance(parsed, list):
            return []

        cleaned = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            # Require at least one of name / website / instagram_handle
            if not (item.get("business_name") or item.get("website") or item.get("instagram_handle")):
                continue
            # Normalise bare domains to https://
            for url_field in ("website", "instagram_handle", "google_maps_url"):
                v = item.get(url_field)
                if v and isinstance(v, str) and not re.match(r"^https?://", v, re.IGNORECASE):
                    item[url_field] = "https://" + v.lstrip("/")
            cleaned.append(item)

        log.info("text_lead_parser_done", input_len=len(text), extracted=len(cleaned))
        return cleaned
    except Exception as exc:
        log.warning("text_lead_parser_failed", error=str(exc))
        return []
