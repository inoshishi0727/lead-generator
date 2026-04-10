# Follow-Up Email Sequence

Automated 4-step email follow-up system that generates, schedules, and manages follow-up drafts for leads after their initial outreach email is sent.

## How It Works

```
Initial email sent (Day 0)
    |
    v
[Cron: 8am weekdays] --> generateFollowups()
    |
    +--> Day 6:  Generate "1st follow up" draft (send Day 7)
    +--> Day 13: Generate "2nd follow up" draft (send Day 14)
    +--> Day 17: Generate "3rd follow up" draft (send Day 18)
    |
    v
Drafts appear in UI --> Manual review & approve --> sendApproved()
    |
    v
After all 4 steps sent with no reply --> Lead moves to "no_response"
```

## Sequence Steps

| Step | Label | Days from Initial | Word Limit | Angle |
|------|-------|-------------------|------------|-------|
| 1 | Initial (The Opener) | Day 0 | 120 | Specific venue observation + curiosity hook |
| 2 | 1st Follow Up (The Value Touch) | Day 7 | 100 | Social proof, data, or seasonal opportunity |
| 3 | 2nd Follow Up (The Content Share) | Day 14 | 80 | Share useful content, no pitch |
| 4 | 3rd Follow Up (The Soft Close) | Day 18 | 80 | Last message, frictionless CTA, door left open |

Drafts are generated **1 day early** (e.g., Day 6 for a Day 7 send) to allow review time.

## Stopping Rules

Follow-ups are automatically cancelled when any of these conditions are met:

- Lead receives an inbound reply (any sentiment)
- Lead stage changes to `responded`, `converted`, or `declined`
- Lead is marked as `snoozed`, `current_account`, or `in_discussion`
- Lead has `human_takeover: true`

## Scheduled Cron

**`scheduledFollowups`** runs Mon-Fri at 8am London time.

### Blackout Days (No Outreach)

- Weekends (Saturday, Sunday)
- UK bank holidays (hardcoded for 2026-2027)
- December 24 - January 3

### Send Window

Emails are only sent during **Tuesday-Thursday, 9-11am London time** (enforced by `sendApproved`).

## Architecture

### Pure Logic (Extracted for Testability)

**`functions/followup-logic.js`** -- No Firebase, no API calls:
- `shouldSkipLead(lead, hasReply)` -- returns skip reason or null
- `determineFollowUpAction(messages, now)` -- returns action, step number, scheduled date, new stage

### Cloud Functions

**`functions/index.js`**:
- `runFollowUpGeneration()` -- shared core logic (Firestore reads, Claude API, Firestore writes)
- `generateFollowups` -- manual trigger via UI button (callable)
- `scheduledFollowups` -- daily cron trigger (pub/sub)
- `isBlackoutDay(date)` -- holiday/weekend check used by both cron and send window

### Frontend

- **Outreach page** -- "Follow-ups" filter button shows step 2/3/4 messages
- **Message cards** -- display `follow_up_label` badge and `scheduled_send_date`
- **Generate Follow-ups button** -- manually triggers draft generation

### Data Fields Added

**`outreach_messages`**:
- `follow_up_label` -- "initial", "1st follow up", "2nd follow up", "3rd follow up"
- `scheduled_send_date` -- "YYYY-MM-DD" target send date

**`leads`** stage transitions:
- `sent` -> `follow_up_1` (after step 2 draft created)
- `follow_up_1` -> `follow_up_2` (after step 3 draft created)
- `follow_up_2` -> `no_response` (after all 4 steps sent with no reply)

## Testing

### Unit Tests (29 tests)

```bash
cd functions && node --test followup-logic.test.js
```

Covers all scheduling logic, skip conditions, timing edge cases, and full sequence simulation.

### Integration Tests (9 tests)

```bash
firebase emulators:start --only firestore
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --test functions/followup-integration.test.js
```

Tests Firestore reads/writes, stage transitions, and reply cancellation against the emulator.

### Emulator Seed Data

```bash
firebase emulators:start --only firestore,functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node functions/seed-emulator.mjs
```

Seeds 8 test leads covering all scenarios (each follow-up step, completed sequences, inbound replies, snoozed leads, too-early sends).

## Files

| File | Purpose |
|------|---------|
| `functions/followup-logic.js` | Pure scheduling logic |
| `functions/followup-logic.test.js` | Unit tests (29) |
| `functions/followup-integration.test.js` | Integration tests (9) |
| `functions/seed-emulator.mjs` | Emulator test data seeder |
| `functions/index.js` | Cloud Functions (generateFollowups, scheduledFollowups, updated sendApproved) |
| `frontend/src/app/outreach/page.tsx` | Follow-ups filter button |
| `frontend/src/components/message-card.tsx` | Follow-up label + scheduled date badges |
| `frontend/src/hooks/use-outreach.ts` | useGenerateFollowups hook |
| `frontend/src/lib/types.ts` | follow_up_label, scheduled_send_date fields |
| `frontend/src/lib/firestore-api.ts` | Field mapping for new fields |
