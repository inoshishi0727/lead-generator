"""List email messages with their recipients."""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.firestore import get_outreach_messages, get_lead_by_id

msgs = get_outreach_messages(channel="email")
for m in msgs[:10]:
    lead = get_lead_by_id(m.get("lead_id")) if m.get("lead_id") else None
    orig = (lead.get("contact_email") or lead.get("email")) if lead else "?"
    print(f"{m['id'][:12]}  [{m.get('status')}]  {m.get('business_name', '?')}  ->  {orig}")
