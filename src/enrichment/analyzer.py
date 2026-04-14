"""Gemini-based website analysis and product mapping for lead enrichment."""

from __future__ import annotations

import json
import logging
import re

import structlog
from google import genai
from google.genai import errors as genai_errors
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.config.loader import EnrichmentConfig
from src.db.models import (
    ContactInfo,
    EnrichmentData,
    Lead,
    MenuFit,
    ToneTier,
    VenueCategory,
)

log = structlog.get_logger()
_stdlib_log = logging.getLogger(__name__)


@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    retry=retry_if_exception_type(genai_errors.ServerError),
    before_sleep=before_sleep_log(_stdlib_log, logging.WARNING),
    reraise=True,
)
def call_gemini_with_retry(client: genai.Client, **kwargs):
    """Call Gemini generate_content with retry on transient server errors.

    Retries up to 4 times with exponential backoff (2s → 4s → 8s → 16s, capped
    at 30s) on ServerError (5xx — overloaded, unavailable, internal). Client
    errors (4xx invalid prompts) raise immediately on the first attempt.
    """
    return client.models.generate_content(**kwargs)

# Deterministic product mapping per venue category (from brand system prompt)
CATEGORY_PRODUCTS: dict[VenueCategory, list[str]] = {
    VenueCategory.COCKTAIL_BAR: ["DISPENSE", "SCHOFIELD'S"],
    VenueCategory.WINE_BAR: ["ESTATE", "ROSÉ", "ASTERLEY ORIGINAL"],
    VenueCategory.ITALIAN_RESTAURANT: ["DISPENSE", "ASTERLEY ORIGINAL", "ESTATE"],
    VenueCategory.GASTROPUB: ["DISPENSE", "ASTERLEY ORIGINAL"],
    VenueCategory.HOTEL_BAR: ["SCHOFIELD'S", "DISPENSE"],
    VenueCategory.BOTTLE_SHOP: ["DISPENSE", "SCHOFIELD'S", "ESTATE"],
    VenueCategory.DELI_FARM_SHOP: ["ASTERLEY ORIGINAL", "ESTATE"],
    VenueCategory.EVENTS_CATERING: ["ASTERLEY ORIGINAL", "DISPENSE"],
    VenueCategory.RTD: ["DISPENSE", "ASTERLEY ORIGINAL"],
    VenueCategory.RESTAURANT_GROUPS: ["DISPENSE", "SCHOFIELD'S"],
    VenueCategory.FESTIVAL_OPERATORS: ["ASTERLEY ORIGINAL", "DISPENSE"],
    VenueCategory.COOKERY_SCHOOLS: ["DISPENSE", "SCHOFIELD'S"],
    VenueCategory.CORPORATE_GIFTING: ["ASTERLEY ORIGINAL", "DISPENSE"],
    VenueCategory.MEMBERSHIP_CLUBS: ["DISPENSE", "SCHOFIELD'S", "ASTERLEY ORIGINAL"],
    VenueCategory.AIRLINES_TRAINS: ["SCHOFIELD'S", "ASTERLEY ORIGINAL"],
    VenueCategory.SUBSCRIPTION_BOXES: ["DISPENSE", "SCHOFIELD'S"],
    VenueCategory.FILM_TV_THEATRE: ["DISPENSE", "ASTERLEY ORIGINAL"],
    VenueCategory.YACHT_CHARTER: ["SCHOFIELD'S", "DISPENSE"],
    VenueCategory.LUXURY_FOOD_RETAIL: ["SCHOFIELD'S", "ESTATE", "DISPENSE"],
    VenueCategory.GROCERY: ["ASTERLEY ORIGINAL", "SCHOFIELD'S"],
}

ANALYSIS_PROMPT = """You are an expert at analyzing hospitality venue websites for Asterley Bros, \
an independent English Vermouth, Amaro, and Aperitivo producer based in SE26, London.

Build a comprehensive business profile from this website. This profile will be used to:
1. Categorise the venue and decide which Asterley Bros products to pitch
2. Write a personalised outreach email from Rob (founder)
3. Score the lead's fit with the Asterley Bros range

Asterley Bros products: SCHOFIELD'S (English Dry Vermouth, for Martinis), ESTATE (English Sweet Vermouth, \
for Negronis), ROSÉ (Rosé Vermouth, for Spritzes), RED (value sweet vermouth), \
ASTERLEY ORIGINAL (British Aperitivo, Campari alternative, for Spritzes), \
DISPENSE (Modern British Amaro, 24 botanicals, for digestivos and Negronis), \
BRITANNICA (London Fernet).

Return a JSON object with ALL of these fields:

{{
  "venue_category": one of ["cocktail_bar", "wine_bar", "italian_restaurant", \
"gastropub", "hotel_bar", "bottle_shop", "deli_farm_shop", "events_catering", \
"rtd", "restaurant_groups", "festival_operators", "cookery_schools", \
"corporate_gifting", "membership_clubs", "airlines_trains", "subscription_boxes", \
"film_tv_theatre", "yacht_charter", "luxury_food_retail", "grocery"],
  "business_summary": "MAX 20 words. What they are + what they do. e.g. 'Premium cocktail bar in Shoreditch specialising in classic serves and seasonal menus.'",
  "location_area": "neighbourhood name only, e.g. 'Shoreditch' or 'Peckham' or null",
  "menu_fit": one of ["strong", "moderate", "weak", "unknown"],
  "menu_fit_signals": ["short bullet points of evidence, e.g. 'Negroni on menu', 'spritz section', 'stocks craft vermouth'"],
  "drinks_programme": "List actual drinks/cocktails from their menu. Semicolon-separated. e.g. 'Negroni; Espresso Martini; Aperol Spritz; Old Fashioned; House Vermouth Cocktail; Campari Soda'. If no specific drinks listed on website, list the spirit categories they stock e.g. 'Gin; Vodka; Whisky; Vermouth; Amaro'. null ONLY if zero drinks info on website. NEVER summarize in prose — list the actual items.",
  "why_asterley_fits": "MAX 20 words. Concrete reason. e.g. 'Already stocks Campari for Negronis — DISPENSE is a direct swap. Spritz menu would suit ASTERLEY ORIGINAL.'",
  "context_notes": "MAX 15 words. One specific hook for the email. e.g. 'Saw the Calvados Negroni on your Apéritif Hour menu.'",
  "tone_tier": one of ["bartender_casual", "warm_professional", "b2b_commercial", "corporate_formal"],
  "contact_name": "owner, founder, manager, head bartender, buyer, or chef if clearly identified as venue operations staff. NEVER use names from privacy policies, GDPR notices, cookie banners, or legal disclaimers. Return null if only compliance/legal/HR roles are found.",
  "contact_role": "their role (Owner, Founder, Bar Manager, Head Bartender, Buyer, Chef, etc.) or null",
  "contact_confidence": one of ["verified", "likely", "uncertain", null],
  "opening_hours_summary": "brief summary of opening hours if found, e.g. 'Mon-Sat 5pm-midnight, closed Sun' or null",
  "price_tier": one of ["budget", "mid_range", "premium", "luxury", null],
  "ai_approval": one of ["approve", "maybe", "reject"],
  "ai_approval_reason": "MAX 15 words. Why approve or reject. e.g. 'Strong cocktail menu with Negroni — perfect fit' or 'No bar, no drinks, coffee shop only'"
}}

CRITICAL RULES:
- ONLY state facts you can verify from the website content below. NEVER guess or assume.
- If the website doesn't mention drinks, cocktails, or a bar, say "No drinks programme visible on website" — do NOT invent one.
- If you can't determine something, use null. Do NOT write "likely" or "probably" or "potentially".
- Every claim must be traceable to specific text from the website.
- contact_name MUST be a venue operator. Data Privacy Managers, DPOs, Compliance Officers, Legal Counsel, HR Managers, and anyone named only in a privacy policy or GDPR notice are NOT valid contacts — return null in that case.

Business: {business_name}
Google Maps category: {google_category}
Address: {address}

Website content:
---
{website_text}
---

Return ONLY valid JSON. No markdown fencing, no backticks, no explanation."""


def _parse_gemini_response(raw: str) -> dict | None:
    """Parse Gemini response as JSON, with fallback for markdown-fenced output."""
    if not raw:
        return None

    cleaned = raw.strip()

    # Strip markdown code fences: ```json ... ``` or ``` ... ```
    if cleaned.startswith("```"):
        # Find the first newline (skip the ```json line)
        first_nl = cleaned.index("\n") if "\n" in cleaned else 0
        # Find the last ```
        last_fence = cleaned.rfind("```")
        if last_fence > first_nl:
            cleaned = cleaned[first_nl + 1 : last_fence].strip()
        else:
            # Just strip the opening fence
            cleaned = cleaned[first_nl + 1 :].strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Fallback: find the outermost { ... } block using brace counting
    start = raw.find("{")
    if start == -1:
        return None

    depth = 0
    end = start
    for i in range(start, len(raw)):
        if raw[i] == "{":
            depth += 1
        elif raw[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    if depth == 0 and end > start:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass

    # Truncation-tolerant fallback: response was cut off mid-generation
    # (hit max_output_tokens). Walk back to the last complete key-value pair,
    # strip any dangling partial string/number, and close the braces.
    return _parse_truncated_json(raw[start:])


def _parse_truncated_json(partial: str) -> dict | None:
    """Best-effort parse of a JSON object whose output was truncated.

    Strategy: find the last comma or colon-value pair that is clearly complete,
    cut there, close any open strings/brackets/braces, and attempt to parse.
    """
    if not partial or partial[0] != "{":
        return None

    # Walk forward tracking string state and bracket depth. Record the last
    # position where we were outside a string and had just finished a value
    # (i.e. just saw a `,` or a `}`/`]` that closed a nested container).
    in_string = False
    escape = False
    stack: list[str] = []  # tracks '{' and '['
    last_safe = -1  # position just after the last completed value

    for i, ch in enumerate(partial):
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{" or ch == "[":
            stack.append(ch)
        elif ch == "}" or ch == "]":
            if stack:
                stack.pop()
            # A closed nested container counts as a completed value
            if len(stack) >= 1:
                last_safe = i + 1
        elif ch == "," and len(stack) == 1:
            # Top-level comma in the outer object — everything before is safe
            last_safe = i

    if last_safe <= 0:
        return None

    # Truncate at the last safe point and close any still-open containers.
    truncated = partial[:last_safe].rstrip().rstrip(",")
    # Count open braces/brackets in the truncated prefix to close them
    open_count = {"{": 0, "[": 0}
    in_str = False
    esc = False
    for ch in truncated:
        if esc:
            esc = False
            continue
        if ch == "\\" and in_str:
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            open_count["{"] += 1
        elif ch == "}":
            open_count["{"] -= 1
        elif ch == "[":
            open_count["["] += 1
        elif ch == "]":
            open_count["["] -= 1

    closing = ""
    # Close in reverse order — can't know exact nesting without tracking a stack,
    # but for Gemini's flat-ish schema this works in practice. Prefer ] before }.
    closing += "]" * max(0, open_count["["])
    closing += "}" * max(0, open_count["{"])

    try:
        return json.loads(truncated + closing)
    except json.JSONDecodeError:
        return None


def _safe_enum(enum_cls, value, default=None):
    """Safely convert a string to an enum value."""
    if value is None:
        return default
    try:
        return enum_cls(value)
    except ValueError:
        return default


async def analyze_website(
    text: str,
    lead: Lead,
    config: EnrichmentConfig,
    menu_url: str | None = None,
) -> EnrichmentData:
    """Analyze website text using Gemini and return structured enrichment data.

    Product mapping is deterministic based on venue category — not AI-inferred.
    """
    if not text:
        return EnrichmentData(
            enrichment_status="failed",
            enrichment_error="No website text to analyze",
        )

    prompt = ANALYSIS_PROMPT.format(
        business_name=lead.business_name,
        google_category=lead.category or "unknown",
        address=lead.address or "London",
        website_text=text,
    )

    try:
        client = genai.Client()
        response = call_gemini_with_retry(
            client,
            model=config.gemini_model,
            contents=prompt,
            config={
                "max_output_tokens": config.gemini_max_tokens,
                "temperature": config.gemini_temperature,
                "response_mime_type": "application/json",
            },
        )
        raw_text = response.text
    except Exception as e:
        log.error("gemini_analysis_failed", lead=lead.business_name, error=str(e))
        return EnrichmentData(
            enrichment_status="failed",
            enrichment_error=f"Gemini API error: {e}",
        )

    parsed = _parse_gemini_response(raw_text)
    if not parsed:
        log.warning(
            "gemini_parse_failed",
            lead=lead.business_name,
            raw=raw_text[:200],
        )
        return EnrichmentData(
            enrichment_status="failed",
            enrichment_error="Failed to parse Gemini JSON response",
        )

    # Build EnrichmentData from parsed JSON
    venue_category = _safe_enum(VenueCategory, parsed.get("venue_category"))
    menu_fit = _safe_enum(MenuFit, parsed.get("menu_fit"), MenuFit.UNKNOWN)
    tone_tier = _safe_enum(ToneTier, parsed.get("tone_tier"))

    # Deterministic product mapping
    lead_products = (
        CATEGORY_PRODUCTS.get(venue_category, []) if venue_category else []
    )

    # Contact info
    contact = None
    contact_name = parsed.get("contact_name")
    if contact_name:
        contact = ContactInfo(
            name=contact_name,
            role=parsed.get("contact_role"),
            confidence=parsed.get("contact_confidence", "uncertain"),
        )

    enrichment = EnrichmentData(
        venue_category=venue_category,
        business_summary=parsed.get("business_summary"),
        location_area=parsed.get("location_area"),
        menu_fit=menu_fit,
        menu_fit_signals=parsed.get("menu_fit_signals", []),
        drinks_programme=parsed.get("drinks_programme"),
        why_asterley_fits=parsed.get("why_asterley_fits"),
        context_notes=parsed.get("context_notes"),
        lead_products=lead_products,
        tone_tier=tone_tier,
        contact=contact,
        opening_hours_summary=parsed.get("opening_hours_summary"),
        price_tier=parsed.get("price_tier"),
        menu_url=menu_url,
        ai_approval=parsed.get("ai_approval"),
        ai_approval_reason=parsed.get("ai_approval_reason"),
        enrichment_source="website",
        enrichment_status="success",
    )

    log.info(
        "website_analyzed",
        lead=lead.business_name,
        category=venue_category.value if venue_category else None,
        menu_fit=menu_fit.value if menu_fit else None,
        contact=contact_name,
    )
    return enrichment
