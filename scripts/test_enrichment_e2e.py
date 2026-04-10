"""End-to-end enrichment test: fetch website -> Gemini analysis -> print results.

Accepts multiple URLs and runs them in parallel. Pulls business name and
category from Firestore if available, otherwise uses the URL as the name.

Does NOT write to Firestore — safe to run anytime.

Usage:
    uv run python scripts/test_enrichment_e2e.py <url1> [url2] [url3] ...

Example:
    uv run python scripts/test_enrichment_e2e.py https://gritchiepubs.com/ https://delaynomore.co.uk/
"""
from __future__ import annotations
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.models import Lead, LeadSource
from src.enrichment.engine import EnrichmentEngine


def _load_lead_meta(urls: list[str]) -> dict[str, dict]:
    """Try to pull business_name and category from Firestore for each URL."""
    meta: dict[str, dict] = {}
    try:
        from src.db.client import get_firestore_client
        db = get_firestore_client()
        if not db:
            return meta
        docs = db.collection("leads").stream()
        for doc in docs:
            d = doc.to_dict()
            w = (d.get("website") or "").rstrip("/")
            for url in urls:
                if w and w == url.rstrip("/"):
                    meta[url] = {
                        "name": d.get("business_name", url),
                        "category": d.get("category", ""),
                    }
    except Exception:
        pass
    return meta


async def enrich_one(url: str, name: str, category: str, engine: EnrichmentEngine) -> None:
    lead = Lead(
        business_name=name,
        website=url,
        category=category,
        source=LeadSource.GOOGLE_MAPS,
    )

    lead = await engine.enrich_lead(lead)
    e = lead.enrichment

    print(f"\n{'='*60}")
    print(f"RESULT: {name}")
    print(f"  URL: {url}")
    print(f"{'='*60}")

    if not e or e.enrichment_status != "success":
        print(f"  FAILED: {e.enrichment_error if e else 'no enrichment data'}")
        return

    print(f"  Venue category:   {e.venue_category.value if e.venue_category else 'null'}")
    print(f"  Menu fit:         {e.menu_fit.value if e.menu_fit else 'null'}")
    print(f"  Price tier:       {e.price_tier or 'null'}")
    print(f"  Tone tier:        {e.tone_tier.value if e.tone_tier else 'null'}")
    print(f"  AI approval:      {e.ai_approval or 'null'} — {e.ai_approval_reason or ''}")
    print()
    print(f"  Business summary: {e.business_summary or 'null'}")
    print()
    print(f"  Drinks programme: {e.drinks_programme or 'null'}")
    print()
    print(f"  Menu fit signals:")
    for s in (e.menu_fit_signals or []):
        print(f"    - {s}")
    print()
    print(f"  Why Asterley fits: {e.why_asterley_fits or 'null'}")
    print(f"  Context notes:     {e.context_notes or 'null'}")
    print(f"  Products:          {', '.join(e.lead_products) if e.lead_products else 'none'}")
    if e.contact:
        print(f"  Contact:           {e.contact.name} ({e.contact.role}) — {e.contact.confidence}")


async def main(urls: list[str]) -> None:
    meta = _load_lead_meta(urls)
    engine = EnrichmentEngine()

    tasks = []
    for url in urls:
        m = meta.get(url, {})
        name = m.get("name") or url
        category = m.get("category") or ""
        tasks.append(enrich_one(url, name, category, engine))

    await asyncio.gather(*tasks)


if __name__ == "__main__":
    urls = sys.argv[1:] if len(sys.argv) > 1 else ["http://www.harwoodarms.com/"]
    asyncio.run(main(urls))
