# Asterley Bros -- AI Lead Generation & Outreach

Automated pipeline for Asterley Bros craft spirits. Scrapes hospitality venue leads across 6 sources, enriches them via Gemini AI, generates personalised outreach emails via Claude, sends via Resend, and tracks inbound replies -- all with human-in-the-loop approval.

---

## Architecture

```
VPS (Hetzner)                  Netlify                    Firebase
+--------------------+         +---------------------+    +---------------------------+
|                    |         |                     |    |                           |
|  FastAPI backend   |         |  Next.js 16         |    |  Cloud Functions          |
|  - Scraper engine  |  <----> |  - Dashboard        |    |  - generateDrafts         |
|  - Enrichment      |         |  - Leads mgmt       |    |  - sendApproved           |
|  - Search queries  |         |  - Outreach review   |    |  - processInboundEmail    |
|  - WebSocket live  |         |  - Analytics         |    |  - logReply               |
|                    |         |  - CSV upload        |    |  - updateLeadOutcome      |
+--------+-----------+         +----------+----------+    +-------------+-------------+
         |                                |                             |
         +--------->   Firestore   <------+-----------------------------+
                       leads | outreach_messages | inbound_replies
                       edit_feedback | users | config | activity_log
```

### Data Flow

1. **Scrape** -- VPS runs weekly cron (Mon 06:00 UTC) across Google Maps, Google Search, Bing, Yell.com, Trustpilot, industry publications
2. **Enrich** -- Gemini analyses each venue's website (category, menu fit, contact info, tone)
3. **Score** -- Weighted scoring ranks leads by fit
4. **Draft** -- Claude generates personalised emails using enrichment data + past edit feedback
5. **Review** -- Admins approve, edit, or reject drafts in the dashboard
6. **Send** -- Resend sends approved emails with plus-addressed reply-to
7. **Reply** -- Inbound webhook matches replies to leads, updates pipeline stage

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Query v5 |
| Backend (VPS) | Python 3.11, FastAPI, Playwright, Camoufox, uv |
| Cloud Functions | Node 20, ESM, Firebase Cloud Functions |
| Database | Firestore |
| AI | Claude Sonnet 4 (email drafts), Gemini 2.5 Flash (enrichment, strategy) |
| Email | Resend (outbound + inbound webhooks) |
| Auth | Firebase Auth (email/password, role-based) |
| Hosting | Netlify (frontend), Hetzner VPS (scrapers/API), Google Cloud (functions) |

---

## VPS (Hetzner)

The VPS at `46.225.19.1` runs the Python backend as a persistent systemd service.

### What Runs On It

- **FastAPI backend** (`main.py`) -- scraping, enrichment, search query management, WebSocket
- **Weekly scraper cron** -- Mon 06:00 UTC, pulls latest code, runs all scrapers
- **On-demand scraping** -- triggered from dashboard via API
- **On-demand enrichment** -- triggered from leads page via API

### Server Spec

| Component | Detail |
|-----------|--------|
| Provider | Hetzner Cloud |
| Plan | CPX31 (4 vCPU, 8 GB RAM, 80 GB NVMe) |
| Location | Nuremberg, DE |
| OS | Ubuntu 24.04 LTS |
| Cost | ~EUR 12.49/mo |

### Service Management

```bash
# SSH in
ssh root@46.225.19.1

# Service control
systemctl status asterley-api
systemctl restart asterley-api
journalctl -u asterley-api -f    # live logs

# Manual scrape
cd /opt/asterley
uv run python -m src.scrapers.gmaps

# Pull latest code
cd /opt/asterley && git pull origin main
systemctl restart asterley-api
```

### Cron Jobs

```
# Weekly full scrape (Mon 06:00 UTC)
0 6 * * 1 /opt/asterley/scripts/weekly-scrape.sh >> /var/log/asterley-scrape.log 2>&1

# Saturday night scrape
0 23 * * 6 cd /opt/asterley && DISPLAY=:99 PROXY_HOST= uv run python -m src.scrapers.gmaps --limit 100
```

### VPS Environment (`/opt/asterley/.env`)

```
FIREBASE_PROJECT_ID=asterley-bros-b29c0
GEMINI_API_KEY=...
PROXY_HOST=go.resiprox.com
PROXY_PORT=5000
PROXY_USERNAME=...
PROXY_PASSWORD=...
GOOGLE_APPLICATION_CREDENTIALS=/opt/asterley/gcloud-creds.json
```

### VPS API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/scrape` | Start scrape job |
| GET | `/api/scrape-status/{run_id}` | Poll scrape progress |
| POST | `/api/enrich` | Start enrichment pipeline |
| GET | `/api/search-queries` | Get current scrape queries |
| PUT | `/api/search-queries` | Update all queries |
| POST | `/api/search-queries/import` | Merge new queries |
| GET | `/api/leads` | List leads |
| GET | `/api/leads/export` | CSV export |
| POST | `/api/score` | Score all leads |
| WS | `/ws` | Real-time update events |

---

## Scrapers

| Scraper | Source | File |
|---------|--------|------|
| Google Maps | Venue-based searches | `src/scrapers/gmaps.py` |
| Google Search | B2B company searches | `src/scrapers/gsearch.py` |
| Bing Search | B2B (broader coverage) | `src/scrapers/bing.py` |
| Directory | Yell.com, Trustpilot | `src/scrapers/directory.py` |
| Industry | Spirits Business, Difford's | `src/scrapers/industry.py` |
| Instagram | Venue discovery | `src/scrapers/instagram.py` |
| Email Extractor | Contact finding | `src/scrapers/email_extractor.py` |

All scrapers inherit from `BaseScraper` (`src/scrapers/base.py`) and use Camoufox anti-detection browsers via `src/scrapers/browser.py`.

Search queries are loaded from Firestore first, falling back to `config.yaml`.

### CSV Upload for Scrape Queries

Upload a CSV from the dashboard or leads page. Format:

```csv
source,query
google_maps,cocktail bars London
google_maps,wine bars Manchester
google_search,UK spirits subscription box companies
bing_search,airline beverage suppliers UK
directory,https://www.yell.com/s/cocktail+bars-london.html
```

Queries save to Firestore `config.search_queries` and are used on the next scrape run.

---

## Frontend

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Dashboard -- metrics, recent leads, scrape controls, outreach plan, CSV upload |
| `/leads` | Lead table with filters, search, quick-add, enrichment, scrape query manager |
| `/outreach` | Message cards -- review, edit, approve, reject, send, reply threads |
| `/analytics` | Funnel chart, category breakdown, trends, reply rates |
| `/settings` | Team management, target ratio manager |
| `/help` | Getting started guide |
| `/login` | Firebase email/password auth |

### API Routes (Next.js server-side)

| Route | Purpose |
|-------|---------|
| `POST /api/enrich` | Gemini website analysis (fallback when VPS unavailable) |
| `POST /api/outreach/send` | Send approved emails via Resend |
| `GET /api/outreach-plan` | Gemini weekly outreach strategy |
| `POST /api/inbound` | Resend inbound webhook for reply matching |

### Key Hooks

| Hook | Purpose |
|------|---------|
| `use-leads.ts` | Fetch/filter leads from Firestore, enrich via VPS |
| `use-outreach.ts` | Outreach messages, approve/reject/send, reply tracking |
| `use-scrape.ts` | Trigger/monitor scrape jobs on VPS |
| `use-search-queries.ts` | Manage scrape queries via VPS |
| `use-live-updates.ts` | WebSocket connection to VPS for real-time updates |
| `use-analytics.ts` | Funnel, trends, category stats |
| `use-lead-detail.ts` | Single lead data + mutations |

### Frontend-to-VPS Integration

The frontend uses two API clients:

- **Firestore direct** -- leads, outreach messages, analytics, auth (via Firebase SDK)
- **VPS API** (`lib/vps-api.ts`) -- scraping, enrichment, search queries, WebSocket

Controlled by `NEXT_PUBLIC_VPS_URL` env var. Only scrape/enrich/query operations go to VPS.

---

## Cloud Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `generateDrafts` | callable | Claude email draft generation |
| `regenerateDraft` | callable | Regenerate a single draft |
| `regenerateAllDrafts` | callable | Wipe and recreate all drafts |
| `sendApproved` | callable | Send approved emails via Resend |
| `processInboundEmail` | HTTP POST | Resend inbound webhook handler |
| `logReply` | callable | Manually log a reply |
| `updateLeadOutcome` | callable | Set lead outcome |
| `assignReplyToLead` | callable | Link unmatched reply to a lead |
| `getOutreachPlan` | callable | Gemini weekly outreach strategy |
| `getStrategy` | callable | Gemini campaign recommendations |
| `deleteUser` | callable | Delete user account + data |

---

## Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `leads` | Venue records with enrichment, scoring, stage |
| `outreach_messages` | Email drafts and sent messages |
| `inbound_replies` | Matched/unmatched reply records |
| `edit_feedback` | Human corrections to Claude drafts (few-shot learning) |
| `users` | Firebase Auth users with roles (admin/viewer) |
| `activity_log` | Audit trail |
| `webhook_events` | Idempotency records for Resend webhooks |
| `config` | Configuration overrides (search queries, scrape settings) |
| `scrape_runs` | Scrape job history and status |

### Pipeline Stages

```
scraped -> needs_email -> enriched -> scored -> draft_generated -> approved -> sent -> follow_up_1 -> follow_up_2 -> responded -> converted | declined
```

---

## Setup

### Prerequisites

- Node 20+
- Python 3.11+ with [uv](https://docs.astral.sh/uv/)
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project with Firestore enabled
- Resend account with inbound domain (`replies.asterleybros.com`)

### Local Development

```bash
# Frontend (http://localhost:4000)
cd frontend && npm install && npm run dev

# Cloud Functions (http://localhost:5001)
cd functions && npm install && firebase emulators:start --only functions

# Python backend (http://localhost:8000) -- optional, for scraper testing
cd . && uv sync && uv run uvicorn main:app --reload
```

### Environment Variables

#### Frontend (`frontend/.env.local`)

```
NEXT_PUBLIC_VPS_URL=http://46.225.19.1:8000
NEXT_PUBLIC_FIREBASE_PROJECT_ID=asterley-bros-b29c0
NEXT_PUBLIC_FIREBASE_API_KEY=<firebase-web-api-key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=asterley-bros-b29c0.firebaseapp.com
RESEND_API_KEY=re_...
GEMINI_API_KEY=...
```

#### Cloud Functions (`functions/.env.local`)

```
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
RESEND_API_KEY=re_...
```

#### VPS (`/opt/asterley/.env`)

```
FIREBASE_PROJECT_ID=asterley-bros-b29c0
GEMINI_API_KEY=...
GOOGLE_APPLICATION_CREDENTIALS=/opt/asterley/gcloud-creds.json
PROXY_HOST=go.resiprox.com
PROXY_PORT=5000
PROXY_USERNAME=...
PROXY_PASSWORD=...
```

---

## Deployment

| Component | Method |
|-----------|--------|
| Frontend | Push to `main` triggers Netlify auto-deploy |
| Cloud Functions | `firebase deploy --only functions` |
| VPS | `ssh root@46.225.19.1` then `cd /opt/asterley && git pull && systemctl restart asterley-api` |
| Netlify env vars | Set `NEXT_PUBLIC_VPS_URL=http://46.225.19.1:8000` in Netlify dashboard |

### Production Secrets

```bash
# Firebase secrets (Cloud Functions)
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set RESEND_API_KEY
```

---

## Commands

```bash
# Frontend
cd frontend && npm run dev          # dev server on :4000
cd frontend && npm run build        # production build
cd frontend && npm run lint         # ESLint
cd frontend && npx tsc --noEmit     # type check

# Cloud Functions
firebase emulators:start --only functions   # local emulator
firebase deploy --only functions            # deploy all
firebase deploy --only functions:<name>     # deploy single

# Python / VPS
uv sync                                     # install Python deps
uv run uvicorn main:app --reload            # local backend
uv run python -m src.scrapers.gmaps         # run scraper locally
uv run pytest                               # run tests
```

---

## Directory Structure

```
asterley-bros/
  frontend/                       # Next.js 16 frontend (Netlify)
    src/
      app/                        # App Router pages + API routes
      components/                 # React components
        ui/                       # shadcn/ui primitives
      hooks/                      # TanStack Query hooks
      lib/                        # Firebase SDK, Firestore API, VPS API, types
  functions/                      # Firebase Cloud Functions (Node 20, ESM)
    index.js                      # All cloud functions
  src/                            # Python backend (VPS)
    api/                          # FastAPI routes
    scrapers/                     # Scraper modules (gmaps, gsearch, bing, etc.)
    scoring/                      # Lead scoring engine
    pipeline/                     # Enrichment + query suggestion pipeline
    config/                       # YAML + Firestore config loader
    db/                           # Firestore CRUD helpers
  scripts/                        # Automation (weekly-scrape.sh)
  config.yaml                     # Scraper configuration (queries, limits)
  main.py                         # FastAPI entrypoint
  docs/                           # Documentation
    brand/                        # Brand voice, drinks guide
    specs/input/                  # Product brief, technical brief, API spec
    vps-proposal.md               # VPS infrastructure proposal
  .github/workflows/              # GitHub Actions (legacy, replaced by VPS cron)
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/vps-proposal.md](docs/vps-proposal.md) | VPS infrastructure proposal and server spec |
| [docs/specs/input/product-brief.md](docs/specs/input/product-brief.md) | Product requirements and success metrics |
| [docs/specs/input/technical-brief.md](docs/specs/input/technical-brief.md) | Full technical architecture reference |
| [docs/specs/input/api-spec.yaml](docs/specs/input/api-spec.yaml) | Lead data model (OpenAPI schema) |
| [docs/brand/](docs/brand/) | Brand voice guide, drinks guide, email templates |
| [docs/prompt-refinement-guide.md](docs/prompt-refinement-guide.md) | How to iterate on email generation prompts |
| [docs/gcp-iam-fix.md](docs/gcp-iam-fix.md) | GCP IAM troubleshooting for 403 errors |
