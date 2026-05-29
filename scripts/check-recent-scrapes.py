"""List leads written in the last N minutes. Verifies a recent scrape wrote to Firestore.

The Lead model timestamps with `scraped_at` (timezone-naive `datetime.now()`),
so we compare with a naive ISO string to match Firestore's lexicographic sort.

Run on the VPS (where Firebase creds are configured):
    cd /root/asterley-bros
    uv run python scripts/check-recent-scrapes.py            # default 60 min
    uv run python scripts/check-recent-scrapes.py 15         # last 15 min
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta

from dotenv import load_dotenv
load_dotenv()

from src.db.client import get_firestore_client


def main() -> int:
    minutes = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    if minutes <= 0:
        print("Usage: uv run python scripts/check-recent-scrapes.py [minutes]")
        return 1

    db = get_firestore_client()
    if db is None:
        print("Firestore client unavailable. Check GOOGLE_APPLICATION_CREDENTIALS.")
        return 1

    # Naive UTC to match the format Pydantic writes (datetime.now() is naive).
    since_dt = datetime.utcnow() - timedelta(minutes=minutes)
    since = since_dt.isoformat()
    print(f"\n=== Leads scraped since {since} (last {minutes} min) ===\n")

    leads = list(db.collection("leads").where("scraped_at", ">=", since).stream())
    if not leads:
        print("No new leads in that window.")
    else:
        rows = sorted(
            (d.to_dict() for d in leads),
            key=lambda l: str(l.get("scraped_at", "")),
            reverse=True,
        )
        print(f"Found {len(rows)} lead(s):\n")
        for l in rows:
            scraped = str(l.get("scraped_at", ""))[:19].replace("T", " ")
            source = (l.get("source") or "?").ljust(14)
            where = l.get("website") or l.get("address") or "—"
            stage = l.get("stage") or "?"
            print(f"  {scraped}  [{source}] {l.get('business_name', '?')}")
            print(f"                       stage={stage}  {where}")

    print(f"\n=== Recent scrape_runs (last 10) ===\n")
    runs = (
        db.collection("scrape_runs")
        .order_by("started_at", direction="DESCENDING")
        .limit(10)
        .stream()
    )
    found_any = False
    for doc in runs:
        found_any = True
        r = doc.to_dict()
        started = str(r.get("started_at", ""))[:19].replace("T", " ")
        leads_found = r.get("leads_found", 0)
        status = r.get("status", "?")
        query = str(r.get("queries") or r.get("query") or "")[:40]
        print(f"  {started}  status={status}  leads={leads_found}  query=\"{query}\"")
    if not found_any:
        print("No scrape_runs found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
