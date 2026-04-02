"""Find all messages for TCR Bar or the first 5 businesses."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.client import get_firestore_client

db = get_firestore_client()

# Check all outreach messages
docs = db.collection("outreach_messages").stream()
all_msgs = []
for doc in docs:
    d = doc.to_dict()
    d["id"] = doc.id
    all_msgs.append(d)

print(f"Total messages in Firestore: {len(all_msgs)}\n")

# Look for the 5 we regenerated
names = ["TCR Bar", "Winemakers Club", "Home House", "American Bar", "Carlotta"]
for name in names:
    matches = [m for m in all_msgs if name.lower() in (m.get("business_name") or "").lower()]
    if matches:
        for m in matches:
            print(f"FOUND: {m.get('business_name')}  [{m.get('status')}]  id={m['id'][:12]}")
            print(f"  recipient: {m.get('recipient_email')}")
            print(f"  subject: {m.get('subject')}")
            print()
    else:
        print(f"MISSING: {name} — no messages found\n")

# Also check which message the user regenerated from dashboard
# Look for any very recent messages
from datetime import datetime, timedelta
print("--- Messages updated in last hour ---")
for m in all_msgs:
    updated = m.get("updated_at") or m.get("created_at") or ""
    if updated:
        try:
            dt = datetime.fromisoformat(updated.replace("Z", "+00:00")) if isinstance(updated, str) else updated
            if hasattr(dt, 'timestamp') and (datetime.now().timestamp() - dt.timestamp()) < 3600:
                print(f"  {m.get('business_name')}  [{m.get('status')}]  id={m['id'][:12]}  updated={updated}")
        except:
            pass
