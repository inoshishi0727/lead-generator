"""Delete all existing outreach messages and generate 10 emails per venue category.

Usage:
    uv run python scripts/generate_category_emails.py --dry-run       # preview lead counts per category
    uv run python scripts/generate_category_emails.py                 # delete old messages + generate
    uv run python scripts/generate_category_emails.py --retry-failed  # generate only for leads missing a message
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

# Ensure project root is on sys.path so `src` is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Load .env before any imports that need credentials
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

import structlog

from src.db.client import get_firestore_client
from src.db.firestore import get_leads, get_outreach_messages, save_outreach_message
from src.db.models import Lead, OutreachChannel, OutreachMessage
from src.outreach.drafts import DraftGenerator

log = structlog.get_logger()

# Maximum emails to generate per category
EMAILS_PER_CATEGORY = 10

# Only generate for enriched SDR venue categories (from the taxonomy)
SDR_CATEGORIES = {
    "cocktail_bar",
    "wine_bar",
    "italian_restaurant",
    "gastropub",
    "hotel_bar",
    "bottle_shop",
    "deli_farm_shop",
    "events_catering",
    "rtd",
    "restaurant_groups",
    "festival_operators",
    "cookery_schools",
    "corporate_gifting",
    "membership_clubs",
    "airlines_trains",
    "subscription_boxes",
    "film_tv_theatre",
    "yacht_charter",
    "luxury_food_retail",
    "grocery",
}


def delete_all_outreach_messages() -> int:
    """Delete every document in the outreach_messages collection. Returns count."""
    db = get_firestore_client()
    if db is None:
        print("ERROR: Firestore not available")
        sys.exit(1)

    deleted = 0
    docs = db.collection("outreach_messages").stream()
    for doc in docs:
        doc.reference.delete()
        deleted += 1
    print(f"Deleted {deleted} outreach messages")
    return deleted


def get_leads_by_category() -> dict[str, list[dict]]:
    """Fetch all leads and group by venue_category."""
    all_leads = get_leads()
    if not all_leads:
        print("ERROR: No leads found in Firestore")
        sys.exit(1)

    by_cat: dict[str, list[dict]] = defaultdict(list)
    for lead in all_leads:
        enrichment = lead.get("enrichment") or {}
        cat = enrichment.get("venue_category") or lead.get("venue_category") or lead.get("category")
        if cat:
            by_cat[cat].append(lead)
        else:
            by_cat["uncategorized"].append(lead)

    return dict(by_cat)


def pick_best_leads(leads: list[dict], limit: int) -> list[dict]:
    """Pick the best leads for email generation.

    Prioritise leads that have:
    1. An email address
    2. Enrichment data (context_notes, drinks_programme, business_summary)
    3. Higher scores
    """
    def sort_key(lead: dict) -> tuple:
        has_email = bool(lead.get("email"))
        enrichment = lead.get("enrichment") or {}
        has_context = bool(enrichment.get("context_notes"))
        has_drinks = bool(enrichment.get("drinks_programme"))
        has_summary = bool(enrichment.get("business_summary"))
        enrichment_score = sum([has_context, has_drinks, has_summary])
        score = lead.get("score") or 0
        return (has_email, enrichment_score, score)

    sorted_leads = sorted(leads, key=sort_key, reverse=True)
    return sorted_leads[:limit]


def get_lead_ids_with_messages() -> set[str]:
    """Return the set of lead_ids that already have an outreach message."""
    messages = get_outreach_messages()
    return {m["lead_id"] for m in messages if m.get("lead_id")}


def _generate_for_leads(
    leads_by_cat: dict[str, list[dict]],
    skip_lead_ids: set[str] | None = None,
) -> tuple[int, int]:
    """Generate emails for leads, optionally skipping those already done.

    Returns (generated_count, error_count).
    """
    generator = DraftGenerator()
    generated = 0
    errors = 0

    for cat in sorted(leads_by_cat.keys()):
        candidates = pick_best_leads(leads_by_cat[cat], EMAILS_PER_CATEGORY)

        if skip_lead_ids:
            candidates = [l for l in candidates if l.get("id") not in skip_lead_ids]

        if not candidates:
            print(f"\n  Category: {cat} - all leads already have messages, skipping")
            continue

        print(f"\n  Category: {cat} ({len(candidates)} emails to generate)")

        for i, lead_data in enumerate(candidates):
            try:
                lead = Lead(**lead_data)
                msg = generator.generate_draft(lead, OutreachChannel.EMAIL, step=1)

                msg_data = msg.model_dump(mode="json")
                msg_data["id"] = str(msg.id)
                msg_data["business_name"] = lead.business_name
                msg_data["venue_category"] = cat
                msg_data["recipient_email"] = lead_data.get("email")
                msg_data["website"] = lead_data.get("website")
                msg_data["menu_fit"] = lead_data.get("enrichment", {}).get("menu_fit")
                msg_data["lead_products"] = lead_data.get("enrichment", {}).get("lead_products", [])
                msg_data["contact_name"] = lead_data.get("enrichment", {}).get("contact", {}).get("name") if lead_data.get("enrichment", {}).get("contact") else None
                msg_data["context_notes"] = lead_data.get("enrichment", {}).get("context_notes")
                msg_data["tone_tier"] = lead_data.get("enrichment", {}).get("tone_tier")

                save_outreach_message(msg_data)
                generated += 1
                print(f"    [{i+1}/{len(candidates)}] {lead.business_name} - OK")

                time.sleep(0.5)

            except Exception as exc:
                errors += 1
                name = lead_data.get("business_name", "unknown")
                print(f"    [{i+1}/{len(candidates)}] {name} - FAILED: {exc}")
                log.error("generate_failed", business=name, error=str(exc))

    return generated, errors


def generate_emails(dry_run: bool = False, retry_failed: bool = False) -> None:
    """Main generation flow."""
    by_cat = get_leads_by_category()

    # Filter to only SDR taxonomy categories
    sdr_cats = {cat: leads for cat, leads in by_cat.items() if cat in SDR_CATEGORIES}
    skipped_cats = {cat: leads for cat, leads in by_cat.items() if cat not in SDR_CATEGORIES}

    print(f"\n{'='*60}")
    print(f"SDR venue categories (will generate):")
    print(f"{'='*60}")
    total_leads = 0
    total_to_generate = 0
    for cat in sorted(sdr_cats.keys()):
        count = len(sdr_cats[cat])
        gen_count = min(count, EMAILS_PER_CATEGORY)
        with_email = sum(1 for l in sdr_cats[cat] if l.get("email"))
        total_leads += count
        total_to_generate += gen_count
        print(f"  {cat:30s}  {count:4d} leads  ({with_email} with email)  -> generate {gen_count}")

    print(f"\nSkipped (not in SDR taxonomy): {len(skipped_cats)} categories, "
          f"{sum(len(v) for v in skipped_cats.values())} leads")
    print(f"{'='*60}")
    print(f"Total SDR leads: {total_leads}")
    print(f"Total emails to generate: {total_to_generate}")
    print(f"{'='*60}\n")

    if dry_run:
        print("DRY RUN: no changes made.")
        return

    if retry_failed:
        print("RETRY MODE: generating only for leads missing a message...\n")
        existing_ids = get_lead_ids_with_messages()
        print(f"Found {len(existing_ids)} leads that already have messages")
        generated, errors = _generate_for_leads(sdr_cats, skip_lead_ids=existing_ids)
    else:
        print("Step 1: Deleting all existing outreach messages...")
        delete_all_outreach_messages()
        print("\nStep 2: Generating emails per category...")
        generated, errors = _generate_for_leads(sdr_cats)

    print(f"\n{'='*60}")
    print(f"Done! Generated: {generated}, Errors: {errors}")
    print(f"{'='*60}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate 10 emails per venue category")
    parser.add_argument("--dry-run", action="store_true", help="Preview lead counts without generating")
    parser.add_argument("--retry-failed", action="store_true", help="Only generate for leads missing a message")
    args = parser.parse_args()
    generate_emails(dry_run=args.dry_run, retry_failed=args.retry_failed)
