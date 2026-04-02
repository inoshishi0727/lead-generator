"""Strip the old plain-text signature from existing outreach messages.

Removes the trailing "Rob\nAsterley Bros\nasterleybros.com" block that the
AI used to generate. The HTML email signature now handles contact details.

Usage:
    uv run python scripts/strip_old_signature.py --dry-run   # preview changes
    uv run python scripts/strip_old_signature.py              # apply changes
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.client import get_firestore_client
from src.db.firestore import get_outreach_messages

# Match the old signature block at the end of the message:
#   Rob\nAsterley Bros\nasterleybros.com  (with optional trailing whitespace)
OLD_SIG_PATTERN = re.compile(
    r"\n\s*Rob\s*\n\s*Asterley Bros\s*\n\s*asterleybros\.com\s*$",
    re.IGNORECASE,
)

dry_run = "--dry-run" in sys.argv

db = get_firestore_client()
if db is None:
    print("ERROR: Firestore not available")
    sys.exit(1)

messages = get_outreach_messages()
print(f"Found {len(messages)} outreach messages")
if dry_run:
    print("(dry run -- no changes will be written)\n")

updated = 0
for msg in messages:
    content = msg.get("content", "")
    if not content:
        continue

    new_content = OLD_SIG_PATTERN.sub("", content)
    if new_content == content:
        continue

    updated += 1
    name = msg.get("business_name", "?")
    print(f"  [{msg.get('status', '?')}] {name}")
    print(f"    BEFORE (last 80 chars): ...{content[-80:]!r}")
    print(f"    AFTER  (last 80 chars): ...{new_content[-80:]!r}")
    print()

    if not dry_run:
        patches = {"content": new_content}
        # Also update original_content if it has the old signature
        original = msg.get("original_content")
        if original:
            new_original = OLD_SIG_PATTERN.sub("", original)
            if new_original != original:
                patches["original_content"] = new_original
        db.collection("outreach_messages").document(msg["id"]).update(patches)

action = "Would update" if dry_run else "Updated"
print(f"\nDone. {action} {updated}/{len(messages)} messages.")
