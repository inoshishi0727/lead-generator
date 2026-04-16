"""
Backfill open tracking data from outreach_messages to leads.

Reads all outreach_messages where opened=True, then writes
last_opened_at and open_count to the corresponding leads doc.

Safe to re-run — only updates leads that have open data.

Usage:
    cd /Users/kothings/Downloads/lead-generator
    uv run python scripts/backfill_open_tracking.py
"""

from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

from google.cloud import firestore

db = firestore.Client(project="asterley-bros-b29c0")

print("Fetching opened outreach_messages...")
msgs = db.collection("outreach_messages").where("opened", "==", True).stream()

lead_opens = defaultdict(lambda: {"last_opened_at": None, "open_count": 0})

for doc in msgs:
    d = doc.to_dict()
    lead_id = d.get("lead_id")
    if not lead_id:
        continue
    entry = lead_opens[lead_id]
    entry["open_count"] += d.get("open_count", 1)
    msg_opened_at = d.get("last_opened_at") or d.get("opened_at")
    if msg_opened_at:
        if entry["last_opened_at"] is None or msg_opened_at > entry["last_opened_at"]:
            entry["last_opened_at"] = msg_opened_at

print(f"Found open data for {len(lead_opens)} leads. Writing to Firestore...")

updated = 0
for lead_id, data in lead_opens.items():
    if not data["last_opened_at"]:
        continue
    try:
        lead_snap = db.collection("leads").document(lead_id).get()
        business_name = lead_snap.to_dict().get("business_name", lead_id) if lead_snap.exists else lead_id
        db.collection("leads").document(lead_id).update({
            "last_opened_at": data["last_opened_at"],
            "open_count": data["open_count"],
        })
        print(f"  ✓ {business_name} — {data['open_count']} open(s), last {data['last_opened_at'][:10]}")
        updated += 1
    except Exception as e:
        print(f"  Skipped {lead_id}: {e}")

print(f"\nDone. Updated {updated} leads.")
