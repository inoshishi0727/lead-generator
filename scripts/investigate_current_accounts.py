"""
Investigate current account leads in Firestore.

Answers:
1. How many leads are marked as current_account?
2. Are any clients missing the current_account flag (have stage=declined but no client_status)?
3. What stage values do current_account leads have?

Usage:
    cd /Users/kothings/Downloads/lead-generator
    uv run python scripts/investigate_current_accounts.py
"""

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local")

from google.cloud import firestore

db = firestore.Client(project="asterley-bros-b29c0")

print("Fetching all leads...")
leads = [{"id": doc.id, **doc.to_dict()} for doc in db.collection("leads").stream()]
print(f"Total leads: {len(leads)}\n")

# --- Q1: How many are marked current_account? ---
current_accounts = [l for l in leads if l.get("client_status") == "current_account"]
print(f"=== Q1: Leads with client_status = 'current_account' ===")
print(f"Count: {len(current_accounts)}\n")
for l in current_accounts:
    print(f"  • {l.get('business_name', l['id'])} | stage={l.get('stage')} | email={l.get('email') or l.get('contact_email') or 'none'}")

# --- Q2: Any leads with stage=declined but no client_status (potential missing flags)? ---
declined_no_status = [
    l for l in leads
    if l.get("stage") == "declined" and not l.get("client_status")
]
print(f"\n=== Q2: stage=declined but no client_status (possibly miscategorised) ===")
print(f"Count: {len(declined_no_status)}")
for l in declined_no_status:
    print(f"  • {l.get('business_name', l['id'])} | rejection_reason={l.get('rejection_reason')}")

# --- Q3: What stages do current_account leads have? ---
from collections import Counter
stage_counts = Counter(l.get("stage") for l in current_accounts)
print(f"\n=== Q3: Stage breakdown for current_account leads ===")
for stage, count in stage_counts.most_common():
    print(f"  {stage or 'None'}: {count}")

# --- Bonus: other client_status values in the DB ---
all_statuses = Counter(l.get("client_status") for l in leads)
print(f"\n=== All client_status values across all leads ===")
for status, count in all_statuses.most_common():
    print(f"  {status or 'None'}: {count}")
