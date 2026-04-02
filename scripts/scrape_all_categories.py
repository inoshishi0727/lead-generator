"""Scrape leads for all 20 SDR venue categories, re-enrich failed leads, then score.

Usage:
    uv run python scripts/scrape_all_categories.py                           # scrape all + re-enrich
    uv run python scripts/scrape_all_categories.py --categories cocktail_bar wine_bar
    uv run python scripts/scrape_all_categories.py --re-enrich-only          # only fix re-scrape leads
    uv run python scripts/scrape_all_categories.py --scrape-only             # only scrape new leads
    uv run python scripts/scrape_all_categories.py --dry-run                 # preview plan
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

import structlog

from src.config.loader import load_config
from src.db.firestore import get_leads, update_lead
from src.db.models import Lead
from src.scrapers.orchestrator import ParallelScrapeOrchestrator

log = structlog.get_logger()

# Search queries per SDR venue category
CATEGORY_QUERIES: dict[str, list[str]] = {
    "cocktail_bar": [
        "cocktail bars London",
        "speakeasy bar London",
    ],
    "wine_bar": [
        "wine bars London",
        "natural wine bar London",
    ],
    "italian_restaurant": [
        "Italian restaurant London",
        "aperitivo bar London",
    ],
    "gastropub": [
        "gastropub London",
        "craft beer pub cocktails London",
    ],
    "hotel_bar": [
        "boutique hotel bar London",
        "hotel cocktail bar London",
    ],
    "bottle_shop": [
        "independent bottle shop London",
        "craft spirits shop London",
    ],
    "deli_farm_shop": [
        "deli shop London",
        "farm shop London",
    ],
    "events_catering": [
        "event catering hire London",
        "wedding catering London",
    ],
    "rtd": [
        "ready to drink brand UK",
        "RTD manufacturer UK",
    ],
    "restaurant_groups": [
        "restaurant group London",
        "hospitality group London multiple venues",
    ],
    "festival_operators": [
        "festival operator UK",
        "outdoor event company UK",
    ],
    "cookery_schools": [
        "cookery school London",
        "cooking class London",
    ],
    "corporate_gifting": [
        "corporate gift hamper UK",
        "premium gift box company UK",
    ],
    "membership_clubs": [
        "private members club London",
        "members club London",
    ],
    "airlines_trains": [
        "airline lounge London",
        "first class train lounge London",
    ],
    "subscription_boxes": [
        "subscription box UK food and drink",
        "spirits subscription box UK",
    ],
    "film_tv_theatre": [
        "film production company London",
        "theatre London West End",
    ],
    "yacht_charter": [
        "superyacht provisioning London",
        "luxury yacht charter UK",
    ],
    "luxury_food_retail": [
        "luxury food hall London",
        "premium food retail London",
    ],
    "grocery": [
        "premium supermarket London",
        "organic grocery London",
    ],
}

TARGET_PER_QUERY = 15


def _needs_rescrape(lead_data: dict) -> bool:
    """Match frontend needsRescrape logic."""
    enrichment = lead_data.get("enrichment") or {}
    drinks = lead_data.get("drinks_programme") or enrichment.get("drinks_programme")
    if not drinks or drinks == "null":
        return True
    status = lead_data.get("enrichment_status") or enrichment.get("enrichment_status")
    if status != "success":
        return True
    return False


def get_rescrape_leads() -> list[dict]:
    """Find all leads flagged as needing re-scrape (failed/missing enrichment)."""
    all_leads = get_leads()
    return [l for l in all_leads if _needs_rescrape(l)]


async def re_enrich_leads(dry_run: bool = False) -> int:
    """Re-enrich leads that need re-scraping. Returns count processed."""
    leads_data = get_rescrape_leads()

    print(f"\n{'='*60}")
    print(f"Re-enrich: {len(leads_data)} leads need re-scraping")
    print(f"{'='*60}")

    if not leads_data:
        print("No leads need re-enrichment.")
        return 0

    # Show first 20
    for i, ld in enumerate(leads_data[:20]):
        enrichment = ld.get("enrichment") or {}
        status = ld.get("enrichment_status") or enrichment.get("enrichment_status") or "none"
        print(f"  {ld.get('business_name', '?'):40s}  status={status}")
    if len(leads_data) > 20:
        print(f"  ... and {len(leads_data) - 20} more")
    print()

    if dry_run:
        return 0

    # Convert to Lead models
    lead_objects = []
    for ld in leads_data:
        try:
            lead_objects.append(Lead(**ld))
        except Exception as exc:
            print(f"  Skipping {ld.get('business_name', '?')}: {exc}")

    print(f"Re-enriching {len(lead_objects)} leads...")
    config = load_config()

    from src.enrichment.engine import EnrichmentEngine
    engine = EnrichmentEngine(config=config)
    enriched_leads = await engine.enrich_leads(lead_objects)

    # Score the re-enriched leads
    from src.scoring.engine import ScoringEngine
    scoring_engine = ScoringEngine(config=config)
    scored_leads = scoring_engine.score_leads(enriched_leads)

    # Save updates back to Firestore
    updated = 0
    for lead in scored_leads:
        updates = {}
        if lead.enrichment:
            updates["enrichment"] = lead.enrichment.model_dump(mode="json")
            updates["enrichment_status"] = lead.enrichment.enrichment_status
            if lead.enrichment.drinks_programme:
                updates["drinks_programme"] = lead.enrichment.drinks_programme
            if lead.enrichment.venue_category:
                updates["venue_category"] = lead.enrichment.venue_category.value
        if lead.score is not None:
            updates["score"] = lead.score
            updates["score_breakdown"] = {
                k: v.model_dump(mode="json") for k, v in lead.score_breakdown.items()
            } if lead.score_breakdown else None
        if lead.stage:
            updates["stage"] = lead.stage.value if hasattr(lead.stage, "value") else lead.stage

        if updates:
            update_lead(str(lead.id), updates)
            updated += 1

    success = sum(
        1 for l in scored_leads
        if l.enrichment and l.enrichment.enrichment_status == "success"
    )
    print(f"\nRe-enrichment done: {success}/{len(scored_leads)} succeeded, {updated} updated in Firestore")
    return updated


async def scrape_categories(categories: list[str], dry_run: bool = False) -> int:
    """Run scrape -> enrich -> score for given categories. Returns lead count."""
    all_queries: list[str] = []
    for cat in categories:
        queries = CATEGORY_QUERIES.get(cat, [])
        if not queries:
            print(f"  WARNING: No queries defined for '{cat}', skipping")
            continue
        all_queries.extend(queries)

    print(f"\n{'='*60}")
    print(f"Scrape plan: {len(categories)} categories, {len(all_queries)} queries")
    print(f"Target: ~{TARGET_PER_QUERY} leads per query")
    print(f"{'='*60}")
    for cat in categories:
        queries = CATEGORY_QUERIES.get(cat, [])
        print(f"  {cat:30s}  {len(queries)} queries")
        for q in queries:
            print(f"    - {q}")
    print(f"{'='*60}\n")

    if dry_run:
        return 0

    config = load_config().model_copy(deep=True)
    config.scraping.google_maps.search_queries = all_queries
    config.scraping.google_maps.target_count = TARGET_PER_QUERY
    config.scraping.google_maps.headless = False  # NEVER headless

    def on_progress(**kwargs):
        phase = kwargs.get("phase", "")
        lead = kwargs.get("current_lead", "")
        if lead:
            print(f"  [{phase}] {lead}")

    orchestrator = ParallelScrapeOrchestrator(config=config, on_progress=on_progress)

    # Phase 1: Scrape
    print("Phase 1: Scraping Google Maps...")
    leads = await orchestrator.scrape_gmaps()
    print(f"\nScraped {len(leads)} leads")

    if not leads:
        print("No new leads found.")
        return 0

    # Phase 2: Enrich
    print("\nPhase 2: Enriching leads...")
    from src.enrichment.engine import EnrichmentEngine
    enrichment_engine = EnrichmentEngine(config=config)
    leads = await enrichment_engine.enrich_leads(leads)
    enriched = sum(1 for l in leads if l.enrichment and l.enrichment.venue_category)
    print(f"Enriched {enriched}/{len(leads)} leads")

    # Phase 3: Score
    print("\nPhase 3: Scoring leads...")
    from src.scoring.engine import ScoringEngine
    scoring_engine = ScoringEngine(config=config)
    leads = scoring_engine.score_leads(leads)
    scored = sum(1 for l in leads if l.score is not None)
    print(f"Scored {scored}/{len(leads)} leads")

    print(f"\n  Scraped:    {len(leads)}")
    print(f"  Enriched:   {enriched}")
    print(f"  Scored:     {scored}")
    print(f"  With email: {sum(1 for l in leads if l.email)}")

    return len(leads)


async def run_all(
    categories: list[str],
    dry_run: bool = False,
    scrape_only: bool = False,
    re_enrich_only: bool = False,
) -> None:
    """Run the full pipeline: re-enrich failed leads + scrape new ones."""

    if re_enrich_only:
        await re_enrich_leads(dry_run=dry_run)
        if not dry_run:
            print(f"\n{'='*60}")
            print("Done! Re-enrichment complete.")
            print(f"{'='*60}")
        return

    if scrape_only:
        await scrape_categories(categories, dry_run=dry_run)
        if not dry_run:
            print(f"\n{'='*60}")
            print("Done! Scraping complete.")
            print(f"{'='*60}")
        return

    # Both: re-enrich first, then scrape
    print("=" * 60)
    print("PART 1: Re-enriching leads that need re-scraping")
    print("=" * 60)
    re_enriched = await re_enrich_leads(dry_run=dry_run)

    print("\n" + "=" * 60)
    print("PART 2: Scraping new leads for all SDR categories")
    print("=" * 60)
    new_leads = await scrape_categories(categories, dry_run=dry_run)

    if not dry_run:
        print(f"\n{'='*60}")
        print(f"All done!")
        print(f"  Re-enriched: {re_enriched} leads")
        print(f"  New leads:   {new_leads}")
        print(f"{'='*60}")
    else:
        print("\nDRY RUN: no changes made.")


def main():
    parser = argparse.ArgumentParser(
        description="Scrape all 20 SDR venue categories + re-enrich failed leads"
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview plan without executing")
    parser.add_argument("--scrape-only", action="store_true", help="Only scrape new leads, skip re-enrichment")
    parser.add_argument("--re-enrich-only", action="store_true", help="Only re-enrich failed leads, skip scraping")
    parser.add_argument(
        "--categories", nargs="+",
        help="Specific categories to scrape (default: all 20)",
        default=list(CATEGORY_QUERIES.keys()),
    )
    args = parser.parse_args()

    invalid = [c for c in args.categories if c not in CATEGORY_QUERIES]
    if invalid:
        print(f"ERROR: Unknown categories: {invalid}")
        print(f"Valid: {', '.join(CATEGORY_QUERIES.keys())}")
        sys.exit(1)

    asyncio.run(run_all(
        categories=args.categories,
        dry_run=args.dry_run,
        scrape_only=args.scrape_only,
        re_enrich_only=args.re_enrich_only,
    ))


if __name__ == "__main__":
    main()
