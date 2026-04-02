"""Temporarily swap the recipient email on a lead for testing.

Usage:
    uv run python scripts/swap_recipient.py
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

db = get_firestore_client()

# Pick TCR Bar message
msgs = get_outreach_messages(channel="email")
msg = next(m for m in msgs if m["id"].startswith("072d40c9"))

lead_id = msg["lead_id"]
lead = get_lead_by_id(lead_id)
original_email = lead.get("contact_email") or lead.get("email")

print(f"Message:    {msg.get('business_name')} ({msg['id'][:12]})")
print(f"Lead ID:    {lead_id}")
print(f"Original:   {original_email}")
print(f"Swapping to: chantal@absolutionlabs.com")
print()

# Save original in a field so we can restore later
db.collection("leads").document(lead_id).update({
    "email": "chantal@absolutionlabs.com",
    "_original_email": original_email,
})

# Also update recipient_email on the message itself and approve it
db.collection("outreach_messages").document(msg["id"]).update({
    "recipient_email": "chantal@absolutionlabs.com",
    "status": "approved",
    "_original_recipient": original_email,
})

print("Done. Lead email swapped and message approved.")
print(f"SAVE THIS — original email: {original_email}")
print(f"SAVE THIS — lead ID: {lead_id}")
print(f"SAVE THIS — message ID: {msg['id']}")
