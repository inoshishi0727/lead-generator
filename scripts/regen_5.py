"""Regenerate 5 draft emails with the updated V5 template.

Usage:
    uv run python scripts/regen_5.py
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.client import get_firestore_client
from src.db.firestore import get_outreach_messages, get_lead_by_id
from src.db.models import Lead, OutreachChannel
from src.outreach.drafts import DraftGenerator

db = get_firestore_client()
if db is None:
    print("ERROR: Firestore not available")
    sys.exit(1)

generator = DraftGenerator()

msgs = get_outreach_messages(channel="email", status="draft")
to_regen = msgs[:5]

print(f"Regenerating {len(to_regen)} emails with V5 template...\n")

for msg in to_regen:
    lead_data = get_lead_by_id(msg["lead_id"]) if msg.get("lead_id") else None
    if not lead_data:
        print(f"  SKIP {msg.get('business_name')} — no lead found")
        continue

    lead = Lead(**lead_data)
    name = msg.get("business_name", "?")

    print(f"  Regenerating: {name}...")
    try:
        new_msg = generator.generate_draft(lead, OutreachChannel.EMAIL, step=1)

        updates = {
            "content": new_msg.content,
            "subject": new_msg.subject,
        }
        db.collection("outreach_messages").document(msg["id"]).update(updates)

        print(f"    Subject: {new_msg.subject}")
        print(f"    Words: {len(new_msg.content.split())}")
        print(f"    Preview: {new_msg.content[:100]}...")
        print()
    except Exception as e:
        print(f"    FAILED: {e}")
        print()

print("Done.")
