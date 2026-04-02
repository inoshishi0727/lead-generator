"""Backfill location_postcode on existing leads from their address field.

Finds leads where location_postcode is null/empty but address contains a
UK postcode, extracts it, and updates the Firestore document.

Usage:
    uv run python scripts/backfill_postcodes.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.client import get_firestore_client
from src.db.firestore import get_leads

UK_POSTCODE_RE = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b", re.IGNORECASE)

db = get_firestore_client()
if db is None:
    print("ERROR: Firestore not available")
    sys.exit(1)

leads = get_leads()
print(f"Loaded {len(leads)} leads")

missing = [l for l in leads if not l.get("location_postcode") and l.get("address")]
print(f"Found {len(missing)} leads with address but no postcode")

updated = 0
failed = 0
for lead in missing:
    match = UK_POSTCODE_RE.search(lead["address"])
    if match:
        postcode = match.group(1).upper()
        # Normalise spacing: ensure single space before inward code
        postcode = re.sub(r"\s+", " ", postcode.strip())
        if len(postcode.replace(" ", "")) >= 5 and " " not in postcode:
            # Missing space — insert before last 3 chars
            postcode = postcode[:-3] + " " + postcode[-3:]

        doc_ref = db.collection("leads").document(lead["id"])
        doc_ref.update({"location_postcode": postcode})
        updated += 1
        print(f"  Updated: {lead.get('business_name', '?')} -> {postcode}")
    else:
        failed += 1

print(f"\nDone: {updated} updated, {failed} had no extractable postcode")
