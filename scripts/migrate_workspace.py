"""One-time migration: create workspace and stamp all existing data with workspace_id.

Usage:
    uv run python scripts/migrate_workspace.py

This script:
1. Creates an "Asterley Bros" workspace document
2. Stamps all existing leads, outreach_messages, scrape_runs, activity_log, and config docs
   with the workspace_id
"""

import os
import sys
from datetime import datetime
from uuid import uuid4

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()


def main():
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        cred = credentials.ApplicationDefault()
        project_id = os.environ.get("FIREBASE_PROJECT_ID", "asterley-bros-b29c0")
        firebase_admin.initialize_app(cred, {"projectId": project_id})

    db = firestore.client()
    workspace_id = str(uuid4())

    # Create workspace
    print(f"Creating workspace: {workspace_id}")
    db.collection("workspaces").document(workspace_id).set({
        "name": "Asterley Bros",
        "created_at": datetime.now().isoformat(),
        "owner_uid": "",  # Set after Rob signs up
    })

    # Collections to stamp
    collections = ["leads", "outreach_messages", "scrape_runs", "activity_log", "config"]

    for coll_name in collections:
        print(f"Migrating {coll_name}...")
        docs = list(db.collection(coll_name).stream())
        count = 0
        batch = db.batch()
        batch_count = 0

        for doc_snap in docs:
            data = doc_snap.to_dict()
            if data.get("workspace_id"):
                continue  # Already migrated
            batch.update(doc_snap.reference, {"workspace_id": workspace_id})
            count += 1
            batch_count += 1

            if batch_count >= 499:
                batch.commit()
                batch = db.batch()
                batch_count = 0

        if batch_count > 0:
            batch.commit()

        print(f"  Stamped {count} documents in {coll_name}")

    print(f"\nMigration complete. Workspace ID: {workspace_id}")
    print("Save this workspace_id — you'll need it when creating user profiles.")
    print(f"\nTo create Rob's admin user profile, run:")
    print(f'  db.collection("users").document("<ROB_UID>").set({{')
    print(f'    "email": "rob@asterleybros.com",')
    print(f'    "display_name": "Rob",')
    print(f'    "role": "admin",')
    print(f'    "workspace_id": "{workspace_id}",')
    print(f'    "created_at": "{datetime.now().isoformat()}",')
    print(f'  }})')


if __name__ == "__main__":
    main()
