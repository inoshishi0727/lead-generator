# Asterley Bros -- AI Lead Generation & Outreach

Automated pipeline for Asterley Bros craft spirits. Scrapes hospitality venue leads, enriches them via Gemini AI, generates personalised outreach emails via Claude, sends via Resend, and tracks inbound replies -- all with human-in-the-loop approval.

## Architecture

```
GitHub Actions (weekly)          Netlify                    Firebase Cloud Functions
  weekly_scrape.yml              Next.js 16 Frontend        generateDrafts (Claude)
  weekly_followup.yml            /api/enrich (Gemini)       regenerateDraft
                                 /api/outreach/send         sendApproved (Resend)
                                 /api/outreach-plan         processInboundEmail
                                 /api/inbound               logReply
                                                            updateLeadOutcome
                                       |                    assignReplyToLead
                                       v
                                   Firestore
                                   leads | outreach_messages | inbound_replies
                                   edit_feedback | users | activity_log | webhook_events
```

## Tech Stack

| Layer      | Technology                                              |
|------------|---------------------------------------------------------|
| Frontend   | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Query v5 |
| Backend    | Firebase Cloud Functions (Node 20, ESM), single `functions/index.js` |
| Database   | Firestore                                               |
| AI         | Claude Sonnet (email drafts), Gemini 2.5 Flash (enrichment, strategy) |
| Email      | Resend (outbound + inbound webhooks)                    |
| Auth       | Firebase Auth (email/password)                          |
| Hosting    | Netlify (frontend), Google Cloud Functions (backend)    |
| CI/CD      | GitHub Actions                                          |
| Scrapers   | Python 3.11 + Playwright + Camoufox (legacy, runs via GitHub Actions) |

## Directory Structure

```
asterley-bros/
  frontend/                    # Next.js 16 frontend
    src/
      app/                     # App Router pages + API routes
        analytics/             # Analytics dashboard
        leads/                 # Leads table + [id] detail
        outreach/              # Message review cards
        login/                 # Firebase auth
        settings/              # Team + ratio management
        help/                  # Getting started
        api/
          enrich/              # Gemini website analysis
          inbound/             # Resend inbound webhook
          outreach/send/       # Send approved emails
          outreach-plan/       # Gemini outreach strategy
      components/              # React components
        ui/                    # shadcn/ui primitives
      hooks/                   # TanStack Query hooks
      lib/                     # Firebase SDK, Firestore API, types, auth
    .env.local                 # Frontend env vars (not committed)
    .env.example               # Template

  functions/                   # Firebase Cloud Functions
    index.js                   # All 11 cloud functions (ESM)
    .env.local                 # Function env vars (not committed)
    .env.example               # Template

  src/                         # Python scrapers (legacy, used by GitHub Actions)
  scripts/                     # Automation scripts
  config.yaml                  # Scraper + pipeline configuration
  docs/                        # Specs and operational docs
    specs/input/               # Product brief, technical brief, API spec
    gcp-iam-fix.md             # GCP org policy fix guide
  .github/workflows/           # CI/CD
    weekly_scrape.yml           # Mon 09:00 UTC -- Google Maps scraper
    weekly_followup.yml         # Wed 10:00 UTC -- follow-up checker
```

## Setup

### Prerequisites

- Node 20+
- Firebase CLI: `npm install -g firebase-tools`
- Python 3.11 + [uv](https://docs.astral.sh/uv/) (only for scrapers)
- A Firebase project with Firestore enabled
- Resend account with inbound domain configured (`replies.asterleybros.com`)

### Environment Variables

#### Frontend (`frontend/.env.local`)

Copy `frontend/.env.example` and fill in:

```
NEXT_PUBLIC_FIREBASE_PROJECT_ID=asterley-bros-b29c0
NEXT_PUBLIC_FIREBASE_API_KEY=<firebase-web-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=asterley-bros-b29c0.firebaseapp.com
RESEND_API_KEY=re_...          # Server-side API routes
GEMINI_API_KEY=...             # /api/enrich, /api/outreach-plan
```

#### Cloud Functions (`functions/.env.local`)

Copy `functions/.env.example` and fill in:

```
ANTHROPIC_API_KEY=sk-ant-...   # Claude email generation
GEMINI_API_KEY=...             # Strategy + enrichment
RESEND_API_KEY=re_...          # Email sending + inbound body fetch
```

For production, use Firebase secret manager:
```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set RESEND_API_KEY
```

### Local Development

```bash
# Frontend (http://localhost:4000)
cd frontend
npm install
npm run dev

# Cloud Functions (http://localhost:5001)
cd functions
npm install
firebase emulators:start --only functions
```

## Key Workflows

### 1. Lead Scraping
GitHub Actions runs `weekly_scrape.yml` every Monday. Python scrapers (Google Maps + Instagram) write leads to Firestore `leads` collection with `stage: "scraped"`.

### 2. Enrichment
Dashboard triggers `/api/enrich` which uses Gemini to analyse the venue's website. Writes analysis to `lead.enrichment` sub-object (cocktails, food style, contact info).

### 3. Draft Generation
Dashboard triggers `generateDrafts` Cloud Function. Claude writes personalised emails using lead enrichment data + past edit feedback as few-shot examples. Creates docs in `outreach_messages` with `status: "draft"`.

### 4. Human Review
Admins review, edit, approve, or reject drafts in the Outreach page. Edits are stored in `edit_feedback` collection so Claude learns the team's voice over time.

### 5. Sending
`sendApproved` Cloud Function sends approved emails via Resend. Each email has a plus-addressed reply-to: `reply+{lead_id}@replies.asterleybros.com`. Daily cap: 150 emails. Optimal window: Tue-Thu 10am-1pm.

### 6. Inbound Replies
Resend fires `email.received` webhook to `processInboundEmail` Cloud Function. It matches the reply to a lead via the plus-address, fetches the full email body from Resend's Receiving API, stores in `inbound_replies`, and updates the lead stage to `responded`.

## Firestore Collections

| Collection           | Purpose                                          |
|---------------------|--------------------------------------------------|
| `leads`             | Venue records with enrichment, scoring, stage    |
| `outreach_messages` | Email drafts and sent messages                   |
| `inbound_replies`   | Matched/unmatched reply records                  |
| `edit_feedback`     | Human corrections to Claude drafts               |
| `users`             | Firebase Auth users with roles (admin/viewer)    |
| `activity_log`      | Audit trail                                      |
| `webhook_events`    | Idempotency records for Resend webhooks          |

### Pipeline Stages

```
scraped -> needs_email -> enriched -> scored -> draft_generated -> approved -> sent -> follow_up_1 -> follow_up_2 -> responded -> converted | declined
```

## Deployment

- **Frontend**: Push to `main` triggers Netlify auto-deploy
- **Cloud Functions**: `firebase deploy --only functions` (or individually: `firebase deploy --only functions:processInboundEmail`)
- **GCP IAM**: See `docs/gcp-iam-fix.md` if Cloud Functions return 403

## Cloud Functions Reference

| Function                | Trigger    | Purpose                                    | Timeout | Memory |
|------------------------|------------|--------------------------------------------|---------|--------|
| `generateDrafts`       | callable   | Claude-powered email draft generation      | 540s    | 512MB  |
| `regenerateDraft`      | callable   | Regenerate a single draft                  | 60s     | 256MB  |
| `regenerateAllDrafts`  | callable   | Wipe and recreate all drafts               | 540s    | 512MB  |
| `getOutreachPlan`      | callable   | Gemini weekly outreach strategy            | 60s     | 256MB  |
| `getStrategy`          | callable   | Gemini campaign recommendations            | 60s     | 256MB  |
| `sendApproved`         | callable   | Send approved emails via Resend            | 540s    | 512MB  |
| `deleteUser`           | callable   | Delete user account + data                 | 30s     | 256MB  |
| `processInboundEmail`  | HTTP POST  | Resend inbound webhook handler             | 30s     | 256MB  |
| `logReply`             | callable   | Manually log a reply                       | 30s     | 256MB  |
| `updateLeadOutcome`    | callable   | Set lead outcome                           | 30s     | 256MB  |
| `assignReplyToLead`    | callable   | Link unmatched reply to a lead             | 30s     | 256MB  |
