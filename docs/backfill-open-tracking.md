# Backfill Open Tracking to Leads

Run this **after** the `processEmailEvents` cloud function has been deployed with the open-tracking fix.

It reads all `outreach_messages` where `opened == true`, then writes `last_opened_at` and `open_count` to the corresponding `leads` doc — so the eye icon appears in the leads table for historical opens.

Safe to re-run: it only updates leads where `outreach_messages` has open data.

## Prerequisites

- `processEmailEvents` deployed with the `last_opened_at` write to leads
- Google ADC credentials valid (`gcloud auth application-default login`)

## Script

Run from the project root:

```bash
cd /Users/kothings/Downloads/lead-generator && uv run python -c "
from google.cloud import firestore

db = firestore.Client(project='asterley-bros-b29c0')

# Fetch all opened outreach_messages
msgs = db.collection('outreach_messages').where('opened', '==', True).stream()

# Group by lead_id: track max last_opened_at and total open_count
from collections import defaultdict
lead_opens = defaultdict(lambda: {'last_opened_at': None, 'open_count': 0})

for doc in msgs:
    d = doc.to_dict()
    lead_id = d.get('lead_id')
    if not lead_id:
        continue
    entry = lead_opens[lead_id]
    entry['open_count'] += d.get('open_count', 1)
    msg_opened_at = d.get('last_opened_at') or d.get('opened_at')
    if msg_opened_at:
        if entry['last_opened_at'] is None or msg_opened_at > entry['last_opened_at']:
            entry['last_opened_at'] = msg_opened_at

print(f'Found open data for {len(lead_opens)} leads. Writing to Firestore...')

updated = 0
for lead_id, data in lead_opens.items():
    if not data['last_opened_at']:
        continue
    try:
        db.collection('leads').document(lead_id).update({
            'last_opened_at': data['last_opened_at'],
            'open_count': data['open_count'],
        })
        updated += 1
    except Exception as e:
        print(f'  Skipped {lead_id}: {e}')

print(f'Done. Updated {updated} leads.')
"
```

## What it does

- Scans all `outreach_messages` where `opened == true`
- Sums `open_count` across all messages per lead (initial + follow-ups)
- Takes the most recent `last_opened_at` across all messages
- Writes both fields to the `leads` doc

After running, refresh the `/leads` page — eye icons will appear for any lead whose email was opened.
