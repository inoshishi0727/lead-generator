"""Send one outreach message to test addresses to verify the HTML signature.

Picks the first draft/approved email message, prints its original recipient,
and sends it to the test addresses via SendGrid.

Usage:
    uv run python scripts/test_signature_send.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

import os
import sendgrid
from sendgrid.helpers.mail import Mail, From, To, Content, MimeType

from src.db.client import get_firestore_client
from src.db.firestore import get_outreach_messages, get_lead_by_id
from src.outreach.email_sender import _build_html_email

SENDER_EMAIL = "rob@asterleybros.com"
SENDER_NAME = "Rob from Asterley Bros"
TEST_RECIPIENTS = ["chantal@absolutionlabs.com", "rob@absolutionlabs.com"]

db = get_firestore_client()
if db is None:
    print("ERROR: Firestore not available")
    sys.exit(1)

# Find first email message (prefer draft/approved)
messages = get_outreach_messages(channel="email")
msg = None
for m in messages:
    if m.get("status") in ("draft", "approved"):
        msg = m
        break

if not msg:
    # Fall back to any email message
    msg = messages[0] if messages else None

if not msg:
    print("ERROR: No email messages found in Firestore")
    sys.exit(1)

# Look up original recipient from lead
original_recipient = None
if msg.get("lead_id"):
    lead = get_lead_by_id(msg["lead_id"])
    if lead:
        original_recipient = lead.get("contact_email") or lead.get("email")

print(f"Message ID: {msg['id']}")
print(f"Business:   {msg.get('business_name', '?')}")
print(f"Status:     {msg.get('status', '?')}")
print(f"Subject:    {msg.get('subject', '(none)')}")
print(f"Original recipient: {original_recipient or '(unknown)'}")
print(f"Sending to: {', '.join(TEST_RECIPIENTS)}")
print()

# Build HTML email
html_body = _build_html_email(msg["content"])

# Send via SendGrid
api_key = os.environ.get("SENDGRID_API_KEY")
if not api_key:
    print("ERROR: SENDGRID_API_KEY not set")
    sys.exit(1)

sg = sendgrid.SendGridAPIClient(api_key=api_key)

for recipient in TEST_RECIPIENTS:
    message = Mail(
        from_email=From(SENDER_EMAIL, SENDER_NAME),
        to_emails=To(recipient),
        subject=msg.get("subject") or "Asterley Bros — Test",
        plain_text_content=Content(MimeType.text, msg["content"]),
        html_content=Content(MimeType.html, html_body),
    )
    response = sg.send(message)
    print(f"  Sent to {recipient} — status {response.status_code}")

print(f"\nDone. Original recipient was: {original_recipient or '(unknown)'}")
print("Message was NOT marked as sent in Firestore.")
