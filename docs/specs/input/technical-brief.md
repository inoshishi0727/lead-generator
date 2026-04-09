# Technical Brief: Asterley Bros AI Lead Generation System

## Architecture Overview

Three-tier system: Next.js 16 frontend on Netlify, Firebase Cloud Functions
(Node 20, ESM) for backend logic, and Firestore for persistence. Python
scrapers run via GitHub Actions on a weekly schedule.

## System Components

### 1. Frontend (`frontend/`)

- **Framework**: Next.js 16 with React 19, TypeScript, Tailwind CSS 4
- **UI**: shadcn/ui component library, dark mode only
- **Data fetching**: TanStack Query v5 with Firebase callable functions
- **Auth**: Firebase Auth (email/password) with role-based access (admin/viewer)
- **Hosting**: Netlify (static export, auto-deploy from `main`)
- **API routes**: Server-side routes using `firebase-admin` for enrichment,
  outbound email sending, outreach planning, and inbound webhook handling

### 2. Cloud Functions (`functions/index.js`)

Single ESM file containing all 11 callable/HTTP functions:

| Function                | Trigger    | Purpose                                    |
|------------------------|------------|--------------------------------------------|
| `generateDrafts`       | callable   | Claude-powered email draft generation      |
| `regenerateDraft`      | callable   | Regenerate a single draft                  |
| `regenerateAllDrafts`  | callable   | Wipe and recreate all drafts               |
| `getOutreachPlan`      | callable   | Gemini weekly outreach strategy            |
| `getStrategy`          | callable   | Gemini campaign recommendations            |
| `sendApproved`         | callable   | Send approved emails via Resend            |
| `deleteUser`           | callable   | Delete user account + data                 |
| `processInboundEmail`  | HTTP POST  | Resend inbound webhook handler             |
| `logReply`             | callable   | Manually log a reply                       |
| `updateLeadOutcome`    | callable   | Set lead outcome                           |
| `assignReplyToLead`    | callable   | Link unmatched reply to a lead             |

- **Runtime**: Node 20, ESM (`"type": "module"`)
- **AI**: Claude Sonnet for email drafts, Gemini 2.5 Flash for enrichment/strategy
- **Email**: Resend for outbound sending + inbound webhook body fetch
- **Secrets**: Firebase secret manager in production, `.env.local` locally

### 3. Database (Firestore)

| Collection           | Purpose                                          |
|---------------------|--------------------------------------------------|
| `leads`             | Venue records with enrichment, scoring, stage    |
| `outreach_messages` | Email drafts and sent messages                   |
| `inbound_replies`   | Matched/unmatched reply records                  |
| `edit_feedback`     | Human corrections to Claude drafts (few-shot)    |
| `users`             | Firebase Auth users with roles                   |
| `activity_log`      | Audit trail                                      |
| `webhook_events`    | Idempotency records for Resend webhooks          |

Pipeline stages:
```
scraped -> needs_email -> enriched -> scored -> draft_generated ->
approved -> sent -> follow_up_1 -> follow_up_2 -> responded ->
converted | declined
```

### 4. Scrapers (`src/`, legacy Python)

- **Google Maps**: Camoufox (Firefox-based anti-detect) + Playwright async API
- **Instagram**: Camoufox + Playwright session-based scraping
- **Scheduling**: GitHub Actions cron (`weekly_scrape.yml` Mon 09:00 UTC,
  `weekly_followup.yml` Wed 10:00 UTC)
- **Output**: Writes leads directly to Firestore `leads` collection

> Note: Python code is used only for scrapers via GitHub Actions.
> All other backend logic is in Firebase Cloud Functions.

### 5. Scoring Engine

- Rule-based scoring with configurable weights from `config.yaml`
- Factors: website presence, email availability, rating threshold,
  review volume, cocktail keywords, venue independence, geography,
  Instagram activity
- Composite score normalized to 0-100

## Dependencies

### Frontend (`frontend/package.json`)
- next, react, typescript, tailwindcss, @tanstack/react-query
- firebase, firebase-admin
- shadcn/ui components, sonner (toasts)
- resend (server-side API routes)

### Cloud Functions (`functions/package.json`)
- firebase-functions, firebase-admin
- @anthropic-ai/sdk (Claude), @google/generative-ai (Gemini)
- resend

### Scrapers (`pyproject.toml`)
- camoufox, playwright, google-cloud-firestore
- pydantic, tenacity, structlog

## Security Considerations
- All secrets in `.env.local` files (not committed) or Firebase secret manager
- Firebase Auth with role-based access control
- Firestore security rules for data access
- Human approval gate before any external communication
- Rate limiting on scrapers and email sending (150/day cap)
- Plus-addressing for inbound reply matching (`reply+{lead_id}@replies.asterleybros.com`)
