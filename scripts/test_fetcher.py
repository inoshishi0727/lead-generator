"""Test the improved fetcher against one or more venue URLs (runs in parallel).

Prints a summary per URL showing what was captured, plus full content of
any PDF, image menu, and menu/drinks page sections.
Watch the logs for:
  - pdf_scanned_fallback  → scanned PDF detected, Vision OCR triggered
  - vision_extracted      → Vision successfully extracted menu text
  - image_text_extracted  → image menu processed via Vision

Usage:
    uv run python scripts/test_fetcher.py <url1> [url2] [url3] ...

Example:
    uv run python scripts/test_fetcher.py http://www.harwoodarms.com/ https://venue2.com https://venue3.com
"""
from __future__ import annotations
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.config.loader import EnrichmentConfig
from src.enrichment.fetcher import fetch_website_text

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

    for section in pdf_sections + image_sections + menu_sections:
        lines = section.strip().split("\n")
        header = lines[0]
        body = "\n".join(lines[1:]).strip()
        print(f"\n  {header}")
        print(f"  {'-'*56}")
        # Print up to 800 chars per section so output stays readable
        preview = body[:800]
        print(f"  {preview}{'...' if len(body) > 800 else ''}")


async def main(urls: list[str]) -> None:
    config = EnrichmentConfig(headless=True)
    await asyncio.gather(*[test_one(url, config) for url in urls])


if __name__ == "__main__":
    urls = sys.argv[1:] if len(sys.argv) > 1 else ["http://www.harwoodarms.com/"]
    asyncio.run(main(urls))
