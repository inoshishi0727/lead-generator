"""Smart scraper: check Firestore counts, re-enrich unenriched leads, then
scrape ONLY the categories still under the target (default 10 per category).

Usage:
    uv run python scripts/scrape_to_target.py                  # full pipeline
    uv run python scripts/scrape_to_target.py --target 15      # custom target
    uv run python scripts/scrape_to_target.py --dry-run        # preview only
    uv run python scripts/scrape_to_target.py --skip-re-enrich # skip re-enrichment pass
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

import structlog

from src.config.loader import load_config
from src.db.firestore import get_leads, update_lead
from src.db.models import Lead, VenueCategory
from src.scrapers.orchestrator import ParallelScrapeOrchestrator

log = structlog.get_logger()

# Import queries from the main scrape script
from scripts.scrape_all_categories import CATEGORY_QUERIES

ALL_CATEGORIES = [vc.value for vc in VenueCategory]
TARGET_PER_QUERY = 15  # overshoot per query to compensate for dedup/misclassification

# Map our venue categories → Google Maps business type keywords to skip
CATEGORY_TO_GMAPS_TYPES: dict[str, list[str]] = {
    "cocktail_bar": ["bar", "cocktail"],
    "wine_bar": ["wine bar", "wine", "winery"],
    "italian_restaurant": ["italian", "restaurant"],
    "gastropub": ["pub", "gastropub"],
    "hotel_bar": ["hotel"],
    "bottle_shop": ["liquor store", "bottle shop", "off-licence"],
    "restaurant_groups": ["restaurant"],
}


def count_per_category() -> dict[str, int]:
    """Count enriched leads per venue_category in Firestore."""
    all_leads = get_leads()
    counts: Counter[str] = Counter()
    for ld in all_leads:
        enrichment = ld.get("enrichment") or {}
        vc = enrichment.get("venue_category")
        if vc and vc not in ("other", ""):
            counts[vc] += 1
    return dict(counts)


def get_unenriched_leads() -> list[dict]:
    """Find leads missing successful enrichment."""
    all_leads = get_leads()
    unenriched = []
    for ld in all_leads:
        enrichment = ld.get("enrichment") or {}
        status = enrichment.get("enrichment_status") or ld.get("enrichment_status") or "none"
        drinks = ld.get("drinks_programme") or enrichment.get("drinks_programme")
        if status != "success" or not drinks or drinks == "null":
            unenriched.append(ld)
    return unenriched


def print_status(counts: dict[str, int], target: int) -> dict[str, int]:
    """Print a table of per-category counts and return the deficit map."""
    deficits: dict[str, int] = {}

    print(f"\n{'Category':<25} {'Count':>5} {'Target':>6} {'Status'}")
    print("-" * 55)
    for cat in ALL_CATEGORIES:
        count = counts.get(cat, 0)
        gap = max(0, target - count)
        if gap > 0:
            deficits[cat] = gap
            status = f"NEED {gap} more"
        else:
            status = "OK"
        print(f"  {cat:<23} {count:>5} {target:>6}   {status}")

    total = sum(counts.values())
    ok = len(ALL_CATEGORIES) - len(deficits)
    print("-" * 55)
    print(f"  Total enriched: {total}  |  {ok}/{len(ALL_CATEGORIES)} categories at target")
    return deficits


async def re_enrich_pass() -> int:
    """Re-enrich all leads missing enrichment. Returns count updated."""
    unenriched = get_unenriched_leads()
    if not unenriched:
        print("\nNo leads need re-enrichment.")
        return 0

    print(f"\nRe-enriching {len(unenriched)} leads with missing/failed enrichment...")

    # Convert to Lead models
    lead_objects = []
    for ld in unenriched:
        try:
            lead_objects.append(Lead(**ld))
        except Exception as exc:
            log.debug("skip_bad_lead", name=ld.get("business_name"), error=str(exc))

    if not lead_objects:
        return 0

    config = load_config()

    from src.enrichment.engine import EnrichmentEngine
    engine = EnrichmentEngine(config=config)
    enriched_leads = await engine.enrich_leads(lead_objects)

    from src.scoring.engine import ScoringEngine
    scoring_engine = ScoringEngine(config=config)
    scored_leads = scoring_engine.score_leads(enriched_leads)

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
    print(f"Re-enrichment done: {success}/{len(scored_leads)} succeeded, {updated} updated")
    return updated


async def scrape_deficit_categories(
    deficits: dict[str, int],
    dry_run: bool = False,
) -> int:
    """Scrape only the categories that are below target. Returns new lead count."""
    if not deficits:
        print("\nAll categories at target — nothing to scrape!")
        return 0

    # Build query list only for deficit categories
    all_queries: list[str] = []
    print(f"\nScraping {len(deficits)} deficit categories:")
    for cat, gap in sorted(deficits.items()):
        queries = CATEGORY_QUERIES.get(cat, [])
        if not queries:
            print(f"  WARNING: no queries defined for '{cat}', skipping")
            continue
        all_queries.extend(queries)
        print(f"  {cat:<25} need {gap}, using {len(queries)} queries")

    if dry_run:
        print(f"\nDRY RUN: would run {len(all_queries)} queries")
        return 0

    config = load_config().model_copy(deep=True)
    config.scraping.google_maps.search_queries = all_queries
    config.scraping.google_maps.target_count = TARGET_PER_QUERY
    config.scraping.google_maps.headless = False  # NEVER headless

    # Build skip set: Google Maps types for categories already at target
    full_categories = [c for c in ALL_CATEGORIES if c not in deficits]
    skip_types: set[str] = set()
    for cat in full_categories:
        for gmaps_type in CATEGORY_TO_GMAPS_TYPES.get(cat, []):
            skip_types.add(gmaps_type)
    if skip_types:
        print(f"\nSkipping Google Maps types: {', '.join(sorted(skip_types))}")

    def on_progress(**kwargs):
        phase = kwargs.get("phase", "")
        lead = kwargs.get("current_lead", "")
        if lead:
            print(f"  [{phase}] {lead}")

    orchestrator = ParallelScrapeOrchestrator(
        config=config, on_progress=on_progress, skip_gmaps_types=skip_types,
    )

    # Phase 1: Scrape
    print(f"\nPhase 1: Scraping {len(all_queries)} queries...")
    leads = await orchestrator.scrape_gmaps()
    print(f"Scraped {len(leads)} new leads")

    if not leads:
        return 0

    # Phase 2: Enrich
    print("\nPhase 2: Enriching new leads...")
    from src.enrichment.engine import EnrichmentEngine
    enrichment_engine = EnrichmentEngine(config=config)
    leads = await enrichment_engine.enrich_leads(leads)
    enriched = sum(1 for l in leads if l.enrichment and l.enrichment.venue_category)
    print(f"Enriched {enriched}/{len(leads)} leads")

    # Filter: only keep leads whose category is in the deficit list
    deficit_cats = set(deficits.keys())
    before = len(leads)
    leads = [
        l for l in leads
        if l.enrichment
        and l.enrichment.venue_category
        and l.enrichment.venue_category.value in deficit_cats
    ]
    dropped = before - len(leads)
    if dropped:
        print(f"Dropped {dropped} leads (category already at target or unknown)")
    print(f"Keeping {len(leads)} leads in deficit categories")

    if not leads:
        print("No leads matched deficit categories.")
        return 0

    # Phase 3: Score
    print("\nPhase 3: Scoring leads...")
    from src.scoring.engine import ScoringEngine
    scoring_engine = ScoringEngine(config=config)
    leads = scoring_engine.score_leads(leads)
    scored = sum(1 for l in leads if l.score is not None)
    print(f"Scored {scored}/{len(leads)} leads")

    return len(leads)


async def run(target: int, dry_run: bool, skip_re_enrich: bool) -> None:
    """Main pipeline: count → re-enrich → recount → scrape deficit → final report."""

    print("=" * 60)
    print(f"SCRAPE-TO-TARGET  |  Goal: {target} leads per category")
    print("=" * 60)

    # Step 1: Current counts
    print("\nStep 1: Checking current Firestore counts...")
    counts = count_per_category()
    deficits = print_status(counts, target)

    if not deficits:
        print("\nAll 20 categories already at target. Done!")
        return

    # Step 2: Re-enrich unenriched leads (may fill some gaps)
    if not skip_re_enrich and not dry_run:
        print(f"\n{'='*60}")
        print("Step 2: Re-enriching unenriched leads (may fill gaps)...")
        print(f"{'='*60}")
        re_enriched = await re_enrich_pass()

        if re_enriched > 0:
            # Recount after re-enrichment
            print("\nRecounting after re-enrichment...")
            counts = count_per_category()
            deficits = print_status(counts, target)

            if not deficits:
                print("\nAll 20 categories now at target after re-enrichment. Done!")
                return
    else:
        if skip_re_enrich:
            print("\nStep 2: Skipped (--skip-re-enrich)")
        elif dry_run:
            print("\nStep 2: Skipped (dry run)")

    # Step 3: Scrape only deficit categories
    print(f"\n{'='*60}")
    print(f"Step 3: Scraping {len(deficits)} deficit categories...")
    print(f"{'='*60}")
    new_leads = await scrape_deficit_categories(deficits, dry_run=dry_run)

    # Step 4: Final report
    print(f"\n{'='*60}")
    print("FINAL STATUS")
    print(f"{'='*60}")
    final_counts = count_per_category()
    final_deficits = print_status(final_counts, target)

    if final_deficits:
        print(f"\n{len(final_deficits)} categories still below target.")
        print("Some categories may have limited Google Maps results.")
        print("Re-run this script to try again, or add more search queries.")
    else:
        print("\nAll 20 categories at target!")


def main():
    parser = argparse.ArgumentParser(
        description="Smart scraper: fill only categories below target count"
    )
    parser.add_argument(
        "--target", type=int, default=10,
        help="Target lead count per category (default: 10)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Preview what would be scraped without executing",
    )
    parser.add_argument(
        "--skip-re-enrich", action="store_true",
        help="Skip re-enrichment pass, go straight to scraping",
    )
    args = parser.parse_args()
    asyncio.run(run(target=args.target, dry_run=args.dry_run, skip_re_enrich=args.skip_re_enrich))


if __name__ == "__main__":
    main()
