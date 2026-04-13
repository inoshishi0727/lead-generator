"""Test the improved fetcher against one or more venue URLs (runs in parallel).

Prints a summary per URL showing what was captured, plus full content of
any PDF, image menu, and menu/drinks page sections.
Watch the logs for:
  - pdf_scanned_fallback  → scanned PDF detected, Vision OCR triggered
  - vision_extracted      → Vision successfully extracted menu text
  - image_text_extracted  → image menu processed via Vision
  - doc_excluded          → privacy/legal/allergen doc skipped (contact-pollution fix)
  - Retrying ...          → Gemini 5xx retry fired (tenacity retry fix)

Usage:
    uv run python scripts/test_fetcher.py <url1> [url2] [url3] ...

Example:
    uv run python scripts/test_fetcher.py http://www.harwoodarms.com/ https://venue2.com https://venue3.com
"""
from __future__ import annotations
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

import structlog

# Surface structlog debug lines (doc_excluded, pdf_scanned_fallback, vision_extracted…)
# and stdlib warnings (tenacity "Retrying ..." before_sleep logs).
logging.basicConfig(level=logging.DEBUG, format="%(message)s")
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
)

from src.config.loader import EnrichmentConfig
from src.db.models import Lead, LeadSource
from src.enrichment.fetcher import fetch_website_text
from src.enrichment.analyzer import analyze_website

MENU_KEYWORDS = ("menu", "drink", "cocktail", "wine", "bar", "food", "eat", "beverage")


async def test_one(url: str, config: EnrichmentConfig) -> None:
    print(f"\n{'='*60}")
    print(f"FETCHING: {url}")
    print(f"{'='*60}")

    text = await fetch_website_text(url, config)

    if not text:
        print(f"  ERROR: No text returned for {url}")
        return

    sections = [s for s in text.split("\n\n---") if s.strip()]

    pdf_sections   = [s for s in sections if "--- PDF:"        in s.split("\n")[0]]
    image_sections = [s for s in sections if "--- IMAGE MENU:" in s.split("\n")[0]]
    menu_sections  = [s for s in sections if "--- PAGE:"       in s.split("\n")[0]
                      and any(k in s.split("\n")[0].lower() for k in MENU_KEYWORDS)]

    print(f"\n  Total chars: {len(text)}  |  Sections: {len(sections)}")
    print(f"  PDF sections:        {len(pdf_sections)}")
    print(f"  Image menu sections: {len(image_sections)}")
    print(f"  Menu/drinks pages:   {len(menu_sections)}")

    # Print full content of captured menu sections
    for section in pdf_sections + image_sections + menu_sections:
        lines = section.strip().split("\n")
        header = lines[0]
        body = "\n".join(lines[1:]).strip()
        print(f"\n  {header}")
        print(f"  {'-'*56}")
        preview = body[:800]
        print(f"  {preview}{'...' if len(body) > 800 else ''}")

    # Run Gemini analysis and print enrichment results
    print(f"\n{'='*60}")
    print(f"ENRICHMENT ANALYSIS: {url}")
    print(f"{'='*60}")
    lead = Lead(business_name=url, website=url, source=LeadSource.GOOGLE_MAPS)
    enrichment = await analyze_website(text, lead, config)

    if enrichment.enrichment_status != "success":
        print(f"  FAILED: {enrichment.enrichment_error}")
        return

    print(f"  Venue category:   {enrichment.venue_category.value if enrichment.venue_category else 'null'}")
    print(f"  Menu fit:         {enrichment.menu_fit.value if enrichment.menu_fit else 'null'}")
    print(f"  Price tier:       {enrichment.price_tier or 'null'}")
    print(f"  AI approval:      {enrichment.ai_approval} — {enrichment.ai_approval_reason or ''}")
    print(f"  Business summary: {enrichment.business_summary or 'null'}")
    print()
    # Contact info — verifies the privacy-PDF pollution fix.
    # If this came from a privacy policy, you'd see "Data Privacy Manager" etc.
    # After the fix, it should be a real venue operator or null.
    if enrichment.contact:
        print(f"  Contact:          {enrichment.contact.name or 'null'}")
        print(f"    role:           {enrichment.contact.role or 'null'}")
        print(f"    confidence:     {enrichment.contact.confidence or 'null'}")
    else:
        print(f"  Contact:          null (no venue operator identified)")
    print()
    print(f"  Drinks programme:")
    print(f"    {enrichment.drinks_programme or 'null'}")
    print()
    print(f"  Menu fit signals:")
    for s in (enrichment.menu_fit_signals or []):
        print(f"    - {s}")
    print()
    print(f"  Why Asterley fits: {enrichment.why_asterley_fits or 'null'}")
    print(f"  Context notes:     {enrichment.context_notes or 'null'}")
    print(f"  Products:          {', '.join(enrichment.lead_products) if enrichment.lead_products else 'none'}")


async def main(urls: list[str]) -> None:
    config = EnrichmentConfig(headless=True)
    await asyncio.gather(*[test_one(url, config) for url in urls])


if __name__ == "__main__":
    urls = sys.argv[1:] if len(sys.argv) > 1 else ["http://www.harwoodarms.com/"]
    asyncio.run(main(urls))
