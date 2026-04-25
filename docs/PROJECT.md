# Asterley Bros — AI Lead Generation & Outreach System
## Project Documentation

---

## What It Does

End-to-end B2B outreach system for Asterley Bros. Scrapes venues (bars, restaurants, retailers), enriches contact data with AI, generates personalised cold emails using Claude, manages approval/send workflow, tracks replies, and runs follow-up sequences automatically.

**Stack:**
- Frontend: Next.js 16 + React 19, deployed on Netlify
- Backend: Firebase Cloud Functions (Node 20, ESM)
- Database: Firestore
- Email sending/receiving: Resend
- AI drafts: Claude (Anthropic)
- AI enrichment + strategy: Gemini (Google)
- Scraping: Python scrapers on Hetzner VPS, triggered via API

---

## Navigation

The app has a sticky top navbar with icon links in this order:

| Icon | Page | URL |
|------|------|-----|
| BarChart3 | Dashboard | `/` |
| Search | Leads | `/leads` |
| Building2 | Clients | `/clients` |
| Megaphone | Campaigns | `/campaigns` |
| Mail | Outreach | `/outreach` |
| TrendingUp | Analytics | `/analytics` |
| Settings | Settings | `/settings` |

User role badge sits top-right. Admins see all pages fully. Members see only their own leads/messages. Viewers are read-only.

---

## Pages

### Dashboard `/`
**What it shows:** Lead pipeline overview — total leads by stage, recent activity, scrape job status, AI outreach plan for the week.

**Key actions:**
- Trigger a scrape job (runs Python scrapers on VPS)
- View live updates as drafts generate
- Read AI-generated weekly outreach plan

---

### Leads `/leads`
**What it shows:** Full lead table with search and filters.

**Filters:**
- Source: Google Maps, Instagram, Manual, Email ingestion
- Stage: Scraped → Enriched → Scored → Approved → Sent → Follow-up 1/2 → Responded → Converted
- Category: Cocktail Bar, Wine Bar, Italian Restaurant, Gastropub, Hotel Bar, Bottle Shop, etc.
- Fit score, postcode

**Actions per lead:**
- **Enrich** — runs Gemini to pull email, contact name, website data
- **Assign** — assign lead to a team member (admin only)
- **Quick Add** — manually add a lead
- **Bulk operations** — bulk assign, bulk approve for outreach

**Lead detail dialog:** Opens on row click. Shows full enrichment data, stage history, linked outreach messages, replies.

---

### Outreach `/outreach`
**What it shows:** All outreach emails with status tabs and stat cards.

**Stat cards (top row):** Total Messages · Pending Drafts · Approved · Sent · Replied

**Drafts by type (second row):** Initial Outreach · Follow-up 1 · Follow-up 2 · Follow-up 3+

**Status tabs:**
| Tab | What shows |
|-----|-----------|
| Draft | AI-generated emails awaiting review |
| Approved | Ready to send |
| Scheduled | Approved with a future send date |
| Sent | Delivered emails |
| Conversations | Emails that received a reply |
| Follow-ups | Pending follow-up emails for leads with a sent step 1 |
| Clients | Client campaign messages |
| All | Everything (non-client) |

**Step filter (below tabs):** All Steps · Initial · Follow-up 1 · Follow-up 2 · Follow-up 3

**Category filter + search bar** below step filter.

**Actions (top right):**
- **Generate Drafts** — AI generates new draft emails for approved leads
- **Regenerate All** — rewrites all existing drafts
- **Approve All (N)** — batch approves all visible drafts
- **Send Approved (N)** — sends all approved emails (respects daily cap of 150, optimal window Tue–Thu 10am–1pm)

**Per-message actions:** Approve · Reject · Edit · Schedule send date · Delete

---

### Clients `/clients`
**What it shows:** Card grid of converted leads / active clients.

Sorted by venue category. Shows contact name, email, location, website. Used for managing ongoing client relationships.

---

### Campaigns `/campaigns`
**What it shows:** Broadcast campaigns to multiple leads at once.

**Campaign types:** Seasonal Promo · Reorder Nudge · New Product · New Menu · Event/Collab

**Filter by:** Status (Draft, Active, Completed), date range

**Modes:** Recommended (AI picks best leads) · All · Custom (manual selection)

Each campaign has its own draft/review/send flow separate from regular outreach.

---

### Analytics `/analytics`
**What it shows:** Performance dashboard.

**Stat cards:** Qualified Leads · Response Rate · Conversion Rate · Avg Score · Reply Rate (12wk) · Open Rate · Delivery Rate · Total Sent

**Charts:**
- Funnel (stages breakdown)
- Category Breakdown (replies by venue type)
- Ratio Comparison (target vs actual)
- Trends (weekly activity)
- Email Performance (7-day opens/clicks)
- Subject Line Analysis

**Sub-page → Team `/analytics/team`** *(admin only)*

Per-member performance cards: Assigned Leads · Emails Sent · Open Rate · Replies · Reply Rate · Converted. Also shows Leads by Stage breakdown per member. Unassigned emails (no team member) appear in a separate row.

---

### Settings `/settings`
**What it shows:** System configuration.

**Sections:**
- **Team Manager** *(admin)* — invite/remove team members, see roles
- **Prompt Rules** *(admin, at `/settings/prompt-rules`)* — configure AI behaviour for draft generation
- **Search Queries** — manage which venue types/locations get scraped
- **Ratio Manager** — set target category ratios for lead mix
- **Change Password** — available to all users
- **Environment Status** — shows which services are connected (Resend, Firestore, VPS)

---

## Email Workflow (End to End)

```
1. Scrape
   Leads imported from Google Maps / Instagram / manual add / email ingestion
   Stage: scraped

2. Enrich
   Gemini pulls email address, contact name, website content, menu fit notes
   Stage: enriched → scored

3. Approve Lead
   Admin/member marks lead as approved for outreach
   Stage: approved

4. Generate Draft
   /outreach → "Generate Drafts"
   Claude writes personalised cold email using lead data + enrichment
   Status: draft

5. Review Draft
   Team member reads, edits if needed, approves or rejects
   Status: approved / rejected

6. Send
   /outreach → "Send Approved"
   Sent via Resend from rob@asterleybros.com
   Reply-to: reply+{lead_id}@replies.asterleybros.com
   Status: sent | Stage: sent

7. Reply Received
   Prospect replies → Resend captures inbound email → processInboundEmail Cloud Function
   → matched to lead via plus-address → has_reply flag set → Stage: responded
   Appears in /outreach → Conversations tab

8. Follow-up
   /outreach → "Generate Follow-ups" (or scheduled cron)
   Generates step 2, 3, 4 emails for leads with a sent step 1 and no reply
   Threaded in recipient's inbox as replies to original email

9. Outcome
   Lead marked: Converted / Not Interested / Ongoing
   Converted leads appear in /clients
```

---

## Cloud Functions Reference

| Function | Trigger | What it does |
|----------|---------|-------------|
| `generateDrafts` | Manual (callable) | AI-writes draft emails for approved leads |
| `regenerateDraft` | Manual (callable) | Rewrites a single draft |
| `regenerateAllDrafts` | Manual (callable) | Rewrites all pending drafts |
| `getOutreachPlan` | Manual (callable) | Gemini generates weekly outreach plan |
| `getStrategy` | Manual (callable) | Gemini writes enrichment/strategy notes for a lead |
| `sendApproved` | Manual (callable) | Sends all approved emails via Resend |
| `sendReply` | Manual (callable) | Sends a reply from the UI (as Rob, threaded) |
| `deleteUser` | Manual (callable) | Removes a team member + unassigns their leads |
| `assignLeads` | Manual (callable) | Bulk-assigns leads + messages to a team member |
| `unassignLeads` | Manual (callable) | Removes assignment from leads |
| `processLeadIngestion` | Resend inbound webhook | Parses forwarded leads sent via email |
| `processInboundEmail` | Resend inbound webhook | Matches reply to lead, sets has_reply, runs sentiment |
| `logReply` | Manual (callable) | Manually logs a reply for a lead |
| `updateLeadOutcome` | Manual (callable) | Sets lead outcome (converted, not_interested, etc.) |
| `assignReplyToLead` | Manual (callable) | Matches an unmatched inbound reply to a lead |
| `generateFollowups` | Manual (callable) | Generates follow-up drafts for eligible leads |
| `scheduledFollowups` | Cron (daily) | Auto-generates follow-ups on schedule |
| `scheduledSendFollowups` | Cron | Auto-sends approved follow-ups in optimal window |
| `scheduledSendCampaigns` | Cron | Auto-sends approved campaign messages |
| `scheduledSendOutreach` | Cron | Auto-sends approved outreach in optimal window |
| `scheduledGenerateCampaignFollowups` | Cron | Generates follow-ups for active campaigns |
| `backfillPlannedCards` | Manual (callable) | Creates planned follow-up cards for sent leads missing them |
| `processEmailEvents` | Resend webhook | Tracks opens, clicks, delivery status on sent emails |
| `scheduledAnalyticsSummary` | Cron (weekly) | Aggregates analytics data |
| `generateClientDrafts` | Manual (callable) | AI-writes emails for client campaign leads |

---

## User Roles

| Role | Can do |
|------|--------|
| **Admin** | Everything — team management, prompt rules, see all leads/messages, team analytics, bulk operations |
| **Member** | Own leads/messages only (auto-scoped by UID), draft/approve/send, view own analytics |
| **Viewer** | Read-only, change password only |

---

## Key Technical Notes

- Emails sent from `rob@asterleybros.com` via Resend — does **not** sync to Gmail Sent
- Reply-to address format: `reply+{lead_id}@replies.asterleybros.com` — routes inbound replies to Firestore
- Daily send cap: 150 emails. Optimal window: Tue–Thu 10am–1pm (enforced in `sendApproved`)
- Draft AI: Claude. Enrichment/strategy/sentiment: Gemini
- Python scrapers run on Hetzner VPS, triggered from frontend via `NEXT_PUBLIC_VPS_URL`
- `assigned_to` field links leads/messages to a team member UID. Deleted users get their leads unassigned automatically
