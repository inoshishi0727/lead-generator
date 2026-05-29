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
