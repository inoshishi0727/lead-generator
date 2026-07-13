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


_RESEARCH_PROMPT = """You are a sales-ops research assistant for Asterley Bros, a premium British drinks brand whose portfolio includes:
- Dispense (Modern British Amaro)
- Schofield's (botanical gin)
- Estate (English vermouth)
- Rosé (rosé vermouth)
- Asterley Original (aperitif)
- Britannica (London Fernet)
- RED (red bitter aperitif)

The user just added a single lead with very little info — usually just a name and possibly a region or business-type hint. Your job is to research this business online using Google Search and return a structured summary plus an assessment of how the Asterley portfolio fits them.

Lead seed:
{seed}

Use Google Search to find what this business does, where it is, how to contact them, and what they currently stock or pour. Acceptable sources: their own website, Google Maps listing, LinkedIn company page, Companies House, news articles, trade press, social media, Crunchbase, Yelp. If multiple distinct businesses match the name, choose the one most likely matching the seed hint; otherwise pick the most plausible UK match.

Return ONLY a valid JSON object with these fields (use null for anything you cannot find — do NOT invent URLs, addresses or phone numbers):
{{
  "business_name": "the canonical name",
  "website": "https://... or null if no real site exists",
  "address": "full postal address or null",
  "phone": "+44... or null",
  "location_area": "neighbourhood / town name or null",
  "location_postcode": "UK postcode or null",
  "venue_category": "one of [cocktail_bar, wine_bar, italian_restaurant, gastropub, hotel_bar, bottle_shop, deli_farm_shop, events_catering, rtd, restaurant_groups, festival_operators, cookery_schools, corporate_gifting, membership_clubs, airlines_trains, subscription_boxes, film_tv_theatre, yacht_charter, luxury_food_retail, grocery, wholesaler] or null",
  "business_summary": "MAX 25 words: what they do, where, who they serve",
  "drinks_programme": "actual cocktails / wines / spirits they're known for, semicolon separated, or null",
  "menu_fit": "one of [strong, moderate, weak, unknown] — strong = obvious cocktail/spirits-led on-trade venue or premium spirits buyer; weak = unrelated category",
  "menu_fit_signals": ["short bullet-point evidence for the fit score, max 4 items"],
  "why_asterley_fits": "MAX 20 words. Concrete reason why this account fits Asterley's portfolio. e.g. 'Stocks Italian amari like Cynar — Dispense slots straight in as a British amaro alternative.'",
  "lead_products": ["1–3 of the Asterley portfolio names most relevant for this venue (use exact spellings above)"],
  "tone_tier": "one of [bartender_casual, warm_professional, b2b_commercial, corporate_formal] — pick how a first email should read for this account",
  "opening_hours_summary": "brief one-line summary like 'Mon-Sat 5pm-midnight, closed Sun' or null",
  "price_tier": "one of [budget, mid, premium, luxury] or null",
  "contact_name": "decision-maker name if findable (owner / GM / head bartender / buyer) — null otherwise",
  "contact_role": "their role title or null",
  "contact_email": "verified email if findable from website / Linkedin — null otherwise",
  "notes": "concrete details: founding story, target customers, region served, news mentions, recent menu changes — null if nothing useful"
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
- notes (relevant context — region hints, why they matter — kept to ONE short sentence; null if nothing useful)
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


_RESEARCH_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"]
_RETRY_DELAYS_S = [2, 5, 10]


def _is_transient_gemini_error(exc: Exception) -> bool:
    """503 (UNAVAILABLE), 429 (quota), 'overloaded', 'high demand' — all worth retrying."""
    msg = str(exc).lower()
    return any(token in msg for token in (
        "503", "unavailable", "high demand", "overloaded",
        "429", "quota", "rate limit", "rate_limit_exceeded",
    ))


def research_lead_via_gemini(seed: str) -> dict[str, Any] | None:
    """Research a single business using Gemini + Google Search grounding.

    Retries on transient Gemini errors (503/429/overloaded) up to 3 attempts
    with exponential backoff. Falls back to gemini-2.0-flash if 2.5-flash
    stays unavailable. Returns None only after all attempts genuinely fail.
    """
    seed = (seed or "").strip()
    if not seed:
        return None

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log.warning("research_no_api_key")
        return None

    import time as _time
    try:
        from google import genai
        from google.genai import types
    except Exception as exc:
        log.warning("research_genai_import_failed", error=str(exc))
        return None

    client = genai.Client(api_key=api_key)
    prompt = _RESEARCH_PROMPT.format(seed=seed[:1000])
    config = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())],
        temperature=0.1,
        max_output_tokens=2048,
    )

    last_error: Exception | None = None

    for model_name in _RESEARCH_MODELS:
        for attempt in range(1, 4):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=config,
                )
                raw = (response.text or "").strip()
                raw = re.sub(r"```json\s*", "", raw)
                raw = raw.replace("```", "").strip()

                start = raw.find("{")
                end = raw.rfind("}")
                if start < 0 or end <= start:
                    log.warning("research_no_json", model=model_name, raw=raw[:300])
                    return None

                data = json.loads(raw[start:end + 1])
                if not isinstance(data, dict):
                    return None

                # Model honestly said "I couldn't find it" — don't retry.
                if not data.get("business_name") and not data.get("website"):
                    log.info("research_not_found", seed=seed[:80], model=model_name)
                    return None

                # Normalise URL fields.
                for url_field in ("website",):
                    v = data.get(url_field)
                    if v and isinstance(v, str) and not re.match(r"^https?://", v, re.IGNORECASE):
                        data[url_field] = "https://" + v.lstrip("/")

                log.info(
                    "research_done",
                    seed=seed[:80],
                    model=model_name,
                    attempt=attempt,
                    name=data.get("business_name"),
                    has_website=bool(data.get("website")),
                )
                return data

            except Exception as exc:
                last_error = exc
                transient = _is_transient_gemini_error(exc)
                log.warning(
                    "research_attempt_failed",
                    model=model_name,
                    attempt=attempt,
                    transient=transient,
                    error=str(exc)[:200],
                )
                if not transient:
                    # Non-transient — bail and don't try the fallback model.
                    return None
                if attempt < 3:
                    _time.sleep(_RETRY_DELAYS_S[attempt - 1])
                    continue
                # Out of retries on this model — break to try the next one.
                break

    log.warning("research_all_models_failed", seed=seed[:80],
                last_error=str(last_error)[:200] if last_error else None)
    return None


def _parse_json_array(raw: str) -> list:
    """Parse a JSON array of objects, tolerating truncation.

    Long listicles can overflow the model's output token cap, cutting the array
    off mid-object. First try a normal parse; if that fails, scan for balanced
    top-level {...} objects (string/escape aware) and parse each complete one,
    salvaging every venue that made it out intact.
    """
    start = raw.find("[")
    if start < 0:
        return []
    body = raw[start:]
    end = body.rfind("]")
    if end > 0:
        try:
            parsed = json.loads(body[: end + 1])
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass

    objs: list = []
    depth = 0
    obj_start = None
    in_str = False
    esc = False
    for i, ch in enumerate(body):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                obj_start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and obj_start is not None:
                    try:
                        objs.append(json.loads(body[obj_start : i + 1]))
                    except Exception:
                        pass
                    obj_start = None
    return objs


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
        prompt = _PROMPT.format(content=text[:20000])
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config={"max_output_tokens": 16384, "temperature": 0.1},
        )
        raw = (response.text or "").strip()
        raw = re.sub(r"```json\s*", "", raw)
        raw = raw.replace("```", "").strip()

        # Truncation-tolerant: a 20-venue listicle can still overflow the cap, so
        # salvage every complete object even if the array was cut off mid-write.
        parsed = _parse_json_array(raw)
        if not parsed:
            log.warning("text_lead_parser_no_json", raw=raw[:300])
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
