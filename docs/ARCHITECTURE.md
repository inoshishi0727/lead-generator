# Asterley Bros — Technical Architecture

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                           │
│   Next.js 16 + React 19 (Netlify)                              │
│   TanStack Query  ·  Firebase JS SDK  ·  WebSocket             │
└────────┬──────────────────────┬────────────────────────────────┘
         │ HTTPS callable        │ Direct Firestore SDK reads
         ▼                       ▼
┌──────────────────┐    ┌──────────────────────────────────────┐
│  Cloud Functions │    │           Firestore                  │
│  (Node 20, ESM)  │◄──►│  asterley-bros-b29c0                 │
│  Firebase Gen 1  │    │  (leads, messages, replies, users…)  │
└────────┬─────────┘    └──────────────────────────────────────┘
         │ Resend API
         ▼
┌──────────────────┐    ┌──────────────────────────────────────┐
│     Resend       │    │         Hetzner VPS                  │
│  Email send/recv │    │  Python scrapers + FastAPI           │
│  Inbound webhook │    │  http://46.225.19.1:8000             │
└──────────────────┘    └──────────────────────────────────────┘
         │ Webhooks (open/deliver/bounce/reply)
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Next.js API Routes (Netlify Functions)                         │
│  /api/inbound  ·  /api/email-events  ·  /api/outreach/send     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Infrastructure

| Layer | Technology | Host |
|-------|-----------|------|
| Frontend | Next.js 16.2, React 19, TypeScript, Tailwind CSS 4, shadcn/ui | Netlify |
| API routes | Next.js Route Handlers (server-side, firebase-admin) | Netlify Functions |
| Cloud Functions | Firebase Gen 1, Node 20, ESM (`"type": "module"`) | Google Cloud |
| Database | Firestore (Native mode) | Google Cloud |
| Email | Resend (send + inbound) | Resend |
| AI — Drafts | Claude (Anthropic SDK) | Anthropic API |
| AI — Enrichment/Sentiment | Gemini (`@google/genai`) | Google AI |
| Scraping | Python + Playwright + FastAPI | Hetzner VPS |
| Auth | Firebase Authentication (email/password) | Google Cloud |

**Firebase Project ID:** `asterley-bros-b29c0`

---

## Frontend Architecture

### App Router Structure
```
frontend/src/app/
├── layout.tsx              # Root layout: QueryProvider + AuthProvider + Navbar
├── page.tsx                # Dashboard
├── leads/page.tsx
├── outreach/page.tsx
├── campaigns/page.tsx
├── clients/page.tsx
├── analytics/
│   ├── page.tsx
│   └── team/page.tsx
├── settings/
│   ├── page.tsx
│   └── prompt-rules/page.tsx
├── login/page.tsx
└── api/                    # Server-side webhook handlers
    ├── inbound/route.ts        # Resend inbound email webhook
    ├── email-events/route.ts   # Resend email tracking events
    ├── outreach/send/route.ts  # Trigger sendApproved
    ├── enrich/route.ts         # Gemini website enrichment
    └── leads/export/route.ts   # CSV export
```

### Data Fetching Strategy
Two paths depending on the tab/context:

**Cloud Functions (HTTPS callable)** — used for write operations and heavy reads:
- Draft generation, send, approve, follow-ups, strategy
- Called via `httpsCallable(functions, "functionName")`
- Wrapped in TanStack Query `useMutation`

**Direct Firestore SDK** — used for real-time reads and client-side filtered tabs:
- Follow-ups, Scheduled, Clients tabs on Outreach page (bypass server cache)
- Analytics aggregations
- All lead table queries
- Wrapped in TanStack Query `useQuery`

**Next.js API Routes** — used for inbound webhooks only:
- `/api/inbound` receives Resend inbound email events
- `/api/email-events` receives open/click/bounce events
- These use `firebase-admin` (service account) not client SDK

### Auth Context (`/lib/auth-context.tsx`)
- `onAuthStateChanged` → fetches user doc from `users/{uid}`
- Exposes: `user`, `isAdmin`, `isMember`, `loading`
- Members auto-scope: `assigned_to === uid` filter applied across all queries

### State Management
- **Server state:** TanStack Query v5 (all Firestore + callable data)
- **UI state:** React `useState` / `useMemo`
- **Real-time:** WebSocket to VPS for scrape job status (`JobsProvider`)
- **Toast notifications:** Sonner

---

## Firestore Collections

### `leads`
```
id                    string    UUID
business_name         string
email                 string | null
contact_name          string | null
phone                 string | null
address               string | null
website               string | null
google_maps_url       string | null
source                "google_maps" | "instagram" | "manual" | "email_ingestion"
stage                 "scraped" | "enriched" | "scored" | "approved" | "sent"
                      "follow_up_1" | "follow_up_2" | "responded" | "converted"
score                 number | null
venue_category        string | null
enrichment_status     "pending" | "done" | "failed" | null
assigned_to           string | null   (user UID)
assigned_to_name      string | null
outcome               "ongoing" | "converted" | "not_interested" | null
human_takeover        boolean
reply_count           number
open_count            number
last_opened_at        string | null
scraped_at            string
```

### `outreach_messages`
```
id                    string    UUID
lead_id               string
campaign_id           string | null
business_name         string
venue_category        string | null
channel               "email" | "instagram_dm"
subject               string | null
content               string
status                "draft" | "approved" | "rejected" | "sent" | "planned"
step_number           number    (1=initial, 2=follow-up 1, etc.)
follow_up_label       string | null
assigned_to           string | null
workspace_id          string
recipient_email       string | null
reply_to_address      string | null   (reply+{lead_id}@replies.asterleybros.com)
email_message_id      string | null   (Resend message ID)
sent_at               string | null
scheduled_send_date   string | null
has_reply             boolean
reply_count           number
opened                boolean
open_count            number
last_opened_at        string | null
delivered             boolean
tone_tier             string | null
is_client_campaign    boolean
content_rating        "great" | "good" | "not_interested" | null
provider              "claude" | "gemini" | null
```

### `inbound_replies`
```
id                    string    UUID
lead_id               string | null   (null if unmatched)
message_id            string | null   (outreach_message ID)
from_email            string
from_name             string
subject               string
body                  string          (stripped of quoted reply)
body_raw              string
body_html             string
sentiment             "positive" | "neutral" | "negative" | null
sentiment_reason      string | null
is_auto_reply         boolean
matched               boolean
matched_by            string          (how it was matched: "plus_address", etc.)
rfc_message_id        string | null
resend_email_id       string | null
created_at            string
```

### `users`
```
uid                   string    (document ID = Firebase Auth UID)
display_name          string
email                 string
role                  "admin" | "member" | "viewer"
workspace_id          string | null
```

### `activity_log`
```
type                  string    (e.g. "assign_leads", "unassign_leads", "lead_ingested_via_email")
lead_id               string | null
business_name         string | null
performed_by          string | null   (user UID)
created_at            string
```

### `webhook_events`
```
resend_email_id       string    (idempotency key)
event_type            "email.opened" | "email.delivered" | "email.bounced" | "email.clicked"
processed_at          string
status                string
```

### `edit_feedback`
```
message_id            string
original_content      string
edited_content        string
content_rating        string | null
channel               string
created_at            string
```

---

## Cloud Functions

All functions in `functions/index.js`. Deployed with `firebase deploy --only functions`.

### Callable (frontend-triggered)

| Function | Auth required | Description |
|----------|--------------|-------------|
| `generateDrafts` | admin/member | Claude writes draft emails for approved leads |
| `regenerateDraft` | admin/member | Rewrites a single draft |
| `regenerateAllDrafts` | admin/member | Rewrites all pending drafts |
| `getOutreachPlan` | any | Gemini generates weekly outreach plan |
| `getStrategy` | any | Gemini writes enrichment/strategy for a lead |
| `sendApproved` | admin/member | Sends approved emails via Resend (daily cap: 150) |
| `sendReply` | admin/member | Sends a reply from UI, threaded via RFC headers |
| `deleteUser` | admin | Removes user + unassigns their leads/messages |
| `assignLeads` | admin | Bulk-assigns leads + messages + replies to a UID |
| `unassignLeads` | admin | Clears assignment from leads |
| `generateFollowups` | admin/member | Generates follow-up drafts for eligible leads |
| `logReply` | admin/member | Manually logs a reply to a lead |
| `updateLeadOutcome` | admin/member | Sets outcome (converted, not_interested) |
| `assignReplyToLead` | admin | Matches unmatched inbound reply to a lead |
| `backfillPlannedCards` | admin | Creates missing planned follow-up cards |
| `generateClientDrafts` | admin/member | AI drafts for client campaign leads |
| `processLeadIngestion` | — | Parses forwarded leads sent via email to Resend |

### Scheduled (Cron) — all times Europe/London

| Function | Schedule | Description |
|----------|----------|-------------|
| `scheduledFollowups` | `0 8 * * 1-5` | Generate follow-up drafts (8am Mon–Fri) |
| `scheduledSendFollowups` | `0 9 * * 2-4` | Send approved follow-ups (9am Tue–Thu) |
| `scheduledSendCampaigns` | `5 9 * * 1-5` | Send campaign emails (9:05am Mon–Fri) |
| `scheduledSendOutreach` | `*/30 * * * *` | Send approved outreach (every 30 min) |
| `scheduledGenerateCampaignFollowups` | `0 8 * * 1-5` | Generate campaign follow-ups (8am Mon–Fri) |
| `scheduledAnalyticsSummary` | `0 9 * * 1` | Weekly analytics summary (9am Mon) |

### Webhook-triggered

| Function | Trigger | Description |
|----------|---------|-------------|
| `processInboundEmail` | Resend inbound webhook | Matches reply to lead, sets has_reply, runs Gemini sentiment |
| `processEmailEvents` | Resend email events webhook | Tracks opens, clicks, bounces on sent emails |

---

## Email Pipeline

### Outbound
```
sendApproved Cloud Function
  → resend.emails.send({
      from:    "Rob Asterley <rob@asterleybros.com>",
      to:      recipient_email,
      replyTo: "reply+{lead_id}@replies.asterleybros.com",
      headers: { In-Reply-To, References }  // for threading follow-ups
    })
  → outreach_messages.status = "sent"
  → leads.stage = "sent" | "follow_up_1" | "follow_up_2"
```

### Inbound Reply
```
Prospect replies
  → Resend captures at replies.asterleybros.com
  → POST /api/inbound (Next.js route)
  → processInboundEmail Cloud Function
  → Extract lead_id from plus-address
  → Match to outreach_message via lead_id
  → Create inbound_replies doc
  → Gemini sentiment analysis
  → outreach_messages.has_reply = true
  → leads.stage = "responded"
  → leads.human_takeover = true
```

### Email Tracking
```
Resend fires event (open/click/bounce/deliver)
  → POST /api/email-events (Next.js route)
  → Idempotency check via webhook_events collection
  → outreach_messages.opened = true / open_count++
  → leads.open_count++
```

---

## VPS Scraper Integration

**VPS:** Hetzner, `http://46.225.19.1:8000`

**Flow:**
```
Frontend → POST NEXT_PUBLIC_VPS_URL/scrape  (trigger job)
VPS FastAPI → runs Python scrapers (Playwright)
VPS WebSocket /ws → streams job status to browser (JobsProvider)
Scrapers → write leads directly to Firestore via service account
```

Scrapers save every item (no filtering at scrape time). Filtering is a UI concern.

---

## Environment Variables

### Frontend (Netlify)
```
NEXT_PUBLIC_VPS_URL          http://46.225.19.1:8000
NEXT_PUBLIC_USE_EMULATORS    true | false
NEXT_PUBLIC_API_URL          (optional, enables VPS API backend mode)
```

### Server-side (Netlify Functions + Cloud Functions)
```
RESEND_API_KEY               Resend email API key
GEMINI_API_KEY               Google AI (Gemini) API key
ANTHROPIC_API_KEY            Claude API key (draft generation)
```

### Firebase Client (hardcoded in `/lib/firebase.ts`)
```
apiKey, authDomain, projectId: asterley-bros-b29c0
storageBucket: asterley-bros-b29c0.firebasestorage.app
messagingSenderId: 963258714410
appId: 1:963258714410:web:62b8cc341496f83c6f3653
```

---

## Local Development

```bash
# Frontend
cd frontend && npm run dev          # http://localhost:4000

# Type check
cd frontend && npx tsc --noEmit

# Cloud Functions emulator
firebase emulators:start --only functions

# Deploy single function
firebase deploy --only functions:generateDrafts

# Deploy all functions
firebase deploy --only functions
```
