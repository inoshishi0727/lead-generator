"""
Migrate existing current account leads to use the unified data model:
  client_status = "current_account"
  stage = "client"
  rejection_reason = null (cleared)

This fixes the 3 leads that were marked via the thumbs-down / outreach path
which incorrectly set client_status = "rejected" + rejection_reason = "current_account".

Usage:
    cd /Users/kothings/Downloads/lead-generator
    uv run python scripts/migrate_current_accounts.py
"""

from dotenv import load_dotenv
load_dotenv(".env")
load_dotenv(".env.local")

from google.cloud import firestore

db = firestore.Client(project="asterley-bros-b29c0")

print("Fetching leads...")
leads = [{"id": doc.id, **doc.to_dict()} for doc in db.collection("leads").stream()]

# Find leads to migrate
to_migrate = [
    l for l in leads
    if (
        # Old path: rejected with reason current_account
        (l.get("client_status") == "rejected" and l.get("rejection_reason") == "current_account")
        # Or: correctly flagged as current_account but stuck on declined stage
        or (l.get("client_status") == "current_account" and l.get("stage") == "declined")
    )
]

print(f"\nFound {len(to_migrate)} leads to migrate:\n")
for l in to_migrate:
    print(f"  • {l.get('business_name', l['id'])} | client_status={l.get('client_status')} | stage={l.get('stage')} | rejection_reason={l.get('rejection_reason')}")

if not to_migrate:
    print("\nNothing to migrate.")
    exit(0)

print(f"\nMigrating {len(to_migrate)} leads to client_status='current_account', stage='client'...")

for l in to_migrate:
    ref = db.collection("leads").document(l["id"])
    ref.update({
        "client_status": "current_account",
        "stage": "client",
        "rejection_reason": firestore.DELETE_FIELD,
    })
    print(f"  ✓ {l.get('business_name', l['id'])}")

print(f"\nDone. {len(to_migrate)} leads migrated.")
