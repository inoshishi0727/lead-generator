"""Backfill recipient_email and website on existing outreach messages from lead data.

Usage:
    uv run python scripts/backfill_message_fields.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.client import get_firestore_client
from src.db.firestore import get_leads, get_outreach_messages

db = get_firestore_client()
if db is None:
    print("ERROR: Firestore not available")
    sys.exit(1)

# Build lead lookup by id
leads = get_leads()
lead_map = {l["id"]: l for l in leads if l.get("id")}
print(f"Loaded {len(lead_map)} leads")

# Get all outreach messages
messages = get_outreach_messages()
print(f"Found {len(messages)} outreach messages")

updated = 0
for msg in messages:
    lead = lead_map.get(msg.get("lead_id"))
    if not lead:
        continue

    patches = {}
    if not msg.get("recipient_email") and lead.get("email"):
        patches["recipient_email"] = lead["email"]
    if not msg.get("website") and lead.get("website"):
        patches["website"] = lead["website"]

    if patches:
        db.collection("outreach_messages").document(msg["id"]).update(patches)
        updated += 1
        print(f"  Patched {msg.get('business_name', '?')}: {', '.join(patches.keys())}")

print(f"\nDone. Updated {updated}/{len(messages)} messages.")
