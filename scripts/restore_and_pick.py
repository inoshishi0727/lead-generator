"""Restore TCR Bar to original and list messages to pick a better one."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.client import get_firestore_client
from src.db.firestore import get_outreach_messages

db = get_firestore_client()

# Restore TCR Bar
db.collection("leads").document("2c617d94-2cf0-4452-8161-39f8583a0df6").update({
    "email": "the.tcr.bar@gmail.com",
})
db.collection("outreach_messages").document("072d40c9-719e-4813-bdbb-0b4d426d8aa1").update({
    "recipient_email": "the.tcr.bar@gmail.com",
    "status": "draft",
})
print("Restored TCR Bar to original.\n")

# List all draft emails with content preview
msgs = get_outreach_messages(channel="email", status="draft")
print(f"Found {len(msgs)} draft emails:\n")
for i, m in enumerate(msgs[:15]):
    content = m.get("content", "")
    preview = content[:120].replace("\n", " ")
    print(f"{i+1}. {m.get('business_name', '?')}")
    print(f"   Subject: {m.get('subject', '(none)')}")
    print(f"   {preview}...")
    print()
