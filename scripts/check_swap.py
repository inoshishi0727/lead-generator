"""Check if the TCR Bar message and lead were swapped correctly."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.client import get_firestore_client

db = get_firestore_client()

# Check the message
msg_doc = db.collection("outreach_messages").document("072d40c9-719e-4813-bdbb-0b4d426d8aa1").get()
if msg_doc.exists:
    d = msg_doc.to_dict()
    print("MESSAGE:")
    print(f"  business_name:      {d.get('business_name')}")
    print(f"  status:             {d.get('status')}")
    print(f"  recipient_email:    {d.get('recipient_email')}")
    print(f"  _original_recipient:{d.get('_original_recipient')}")
else:
    print("MESSAGE NOT FOUND")

# Check the lead
lead_doc = db.collection("leads").document("2c617d94-2cf0-4452-8161-39f8583a0df6").get()
if lead_doc.exists:
    l = lead_doc.to_dict()
    print("\nLEAD:")
    print(f"  email:              {l.get('email')}")
    print(f"  contact_email:      {l.get('contact_email')}")
    print(f"  _original_email:    {l.get('_original_email')}")
else:
    print("LEAD NOT FOUND")
