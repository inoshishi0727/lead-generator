# Operator-loop polish — full plan

Comprehensive shipping plan covering all six features Alex asked for (smart tagging + editable category, persistent recently-added, editable emails, scrape progress visibility, resurface timing, Marlow tools). Organized so the team can start shipping today while the load-bearing Marlow-scope question gets resolved with Alex in parallel.

> **Update (2026-06-17 pm):** Chantal's BETA_PLAN.md merged in. The new items pulled into Beta (analytics scroll fix, generation-log clickable, weak/strong fit contrast, recently-added filter + "Added" column, composite priority score prototype) are tracked in **Section D — Beta catch-up** below. All earlier sections still stand.

---

## How this plan is organized

- **Section A — Ship now.** Iterations that don't depend on Alex's answer to "should Marlow execute or propose?" These can start Monday with no risk of rework.
- **Section B — Needs Alex's input.** Iterations gated on specific decisions only Alex can make. Each has the exact question and what the answer changes.
- **Section C — Ship order + critical path.** Which iterations block which; what can ship in parallel.
- **Section D — Beta catch-up.** Items pulled in from the BETA_PLAN that aren't yet shipped, with priority and effort.

---

## Section A — Ship now (no Alex input needed)

These 14 iterations are pure additive changes that work regardless of how the Marlow-scope question lands. Roughly **~5 working days** total, mostly frontend.

### A1. Editable email + contact_email (½d)
Replicate the existing inline-edit pattern from `lead-detail-dialog.tsx:436-486` (used for website/menu_url/business_name) for `lead.email` and `lead.contact_email`. Basic email-regex validation. Persists via `updateLeadFields()` at `firestore-api.ts:289`. Surfaces `contact_email` for the first time (today it's on the Lead type at `types.ts:86` but never displayed).

### A2. Editable venue_category dropdown (½d)
Same inline-edit pattern, but the input is a `<Select>` populated from the 21-value Gemini enum in `frontend/src/app/api/enrich/route.ts:8-29`. Fixes the misclassification Alex keeps spotting. No data model change.

### A3. Recently-added filter chip (½d)
Add a "Recently added" filter on `frontend/src/app/leads/page.tsx` alongside the existing Stage/Source filters. Options: Today / 7d / 30d / All time. Default "All time." No type changes — uses existing `scraped_at` / `created_at` on Lead.

### A4. "Added" column on leads table (½d)
Sortable column on `leads-table.tsx` showing relative time ("2h ago", "3d ago"). Pairs with A3.

### A5. Tag data model (½d, backend)
Add `tags?: string[]` to `Lead` in `types.ts`. Add `default_tags?: string[]` to `ScrapeRunRecord` in `firestore-api.ts:580-603`. No UI yet.

### A6. Tag normalization utility (¼d)
Pure function: lowercase → replace spaces/underscores with hyphens → strip punctuation → trim. Unit test with `"South London"`, `"south_london"`, `"southlondon"` all → `"south-london"`.

### A7. tag_index Firestore trigger (½d)
Cloud Function trigger on Lead writes. Diff old vs new `tags`, increment/decrement counts in a single `tag_index/{counts}` doc. Frontend reads it for autocomplete.

### A8. Smart-suggest tag autocomplete component (1d)
Chip input with autocomplete. Reads `tag_index`, applies A6 normalization to operator input, surfaces exact matches first, then Levenshtein-1 near-matches ("xmas-2026" ≈ "xmass-2026"). New-tag affordance shows the canonical form before commit.

### A9. Tag chip input on lead detail dialog (½d)
Wires A8 into `lead-detail-dialog.tsx`. Save via `updateLeadFields()`.

### A10. Default-tags chip input on scrape-control (¼d)
Wires A8 into `scrape-control.tsx`. Persists on `scrape_runs.default_tags`. Scraper code path merges those into each new lead's `tags` at write time.

### A11. Cloud Function endpoint for VPS scrape telemetry (½d)
New callable `recordScrapeProgress({ run_id, phase, progress_pct, current_query })`. Bearer-token auth (so the VPS doesn't need Firestore admin creds). Writes to `scrape_runs/{run_id}`.

### A12. VPS scraper posts phase + progress every ~15s (½d, src/scrapers/)
Already knows phase ('warmup'/'scrolling'/'extracting'/'saving') and progress in-process; just needs to call A11 on a `setInterval` during the run.

### A13. Extend ScrapeRunRecord type + add `phase`, `progress_pct`, `current_query` fields (¼d)
Type change in `firestore-api.ts`. Frontend can now read these from existing `watchLatestScrapeRun()`.

### A14. Dedicated `/scrapes` page (1d)
New route. Live section at top (running runs as cards: progress bar, phase, current query, leads-found-so-far, dismiss button). History section below (chronological, failed runs flagged red with error + "Re-run with same params" button). Absorbs the existing `pipeline-activity.tsx` live banner and `scrape-history.tsx` card. Add sidebar nav entry. Dashboard banner keeps a "View all →" link to this page. Drop stalled-run threshold from 4h → 1h (`stale-thresholds.ts:15`) now that phase data exists.

### A15. Audit log `actor` field (¼d, foundation)
Extend `activity_log` doc shape to include `actor` (today the field exists implicitly via `uid`; formalize so `"marlow"` / `"system"` / `"alex"` are first-class). All six existing `activity_log` write sites (`functions/index.js:2598, 2665, 3157, 3448, 3533, 3572`) start setting it explicitly. Costs nothing today, unblocks Marlow tool audit later.

---

## Section B — Needs Alex's input

Each iteration here is gated on a specific question. Don't start any of these until Alex has answered the corresponding question — but most questions can be answered in a single 30-minute conversation.

### Question 1 — Marlow's write authority
> *"When you tell Marlow 'retag these 40 leads as wedding venues' or 'change this venue's category to wine_bar' — do you want it done instantly, or done-pending-your-OK?"*

**If "execute instantly":** B1 path below.
**If "stage and approve":** B2 path below.
**If "depends on blast radius" (most likely answer):** B3 hybrid path.

### Question 2 — Error-catching primitive
> *"If Marlow gets one wrong, do you want to (a) catch it before it happens, or (b) undo it after?"*

This decides whether we build a **confirmation card** UI primitive (catch before) or an **undo button** UI primitive (undo after). Materially different code; one is cheap, the other is hard.

### Question 3 — Resurface mechanism
> *"When should we remind you to circle back with leads you've already engaged? Should the system pick a date automatically (e.g. 14 days after a discussion stalls), or should Marlow look at each lead daily and tell you who's worth re-contacting?"*

**If "system picks dates":** B4 path.
**If "Marlow picks daily":** B5 path.

### Question 4 — Resurface cadences (only matters if B4)
> *"Default reminders: in_discussion → 14 days, current_account → 90 days, snoozed → 30 days. Adjust?"*

### Question 5 — Marlow start_scrape authority
> *"Should Marlow be able to kick off a scrape on his own when you ask, or should that always be a click in the UI?"*

Starting a scrape costs money (Gemini API + scraper VPS time). Higher blast radius than tagging.

---

### B1 — Marlow framework (execute mode) [needs Q1=execute, Q2=undo-after]
Tool registry + allowlist. Single-lead actions execute directly; audit log records before/after with `actor: "marlow"`. Per-action one-click undo button in chat ("Undo: reverted tags on Forge Bar"). Estimated **2d**.

### B2 — Marlow framework (propose mode) [needs Q1=stage, Q2=catch-before]
Tool registry + pending-approval queue. Marlow's tool calls write to a `pending_actions` collection; chat surfaces "Marlow wants to: tag 40 leads as south-london. [Approve] [Reject]." Estimated **2d**. (DA's warning: at 40 leads, the operator clicks Approve 40 times unless we bulk-approve — which means we're back to executing.)

### B3 — Marlow framework (tiered) [needs Q1=depends, Q2=both]
Single-lead actions execute directly with undo. Bulk actions (>N leads, default N=5) AND high-blast-radius actions (`start_scrape`, sending email) require a confirmation card. Audit log + undo for executed actions. Estimated **2.5d**. This is the path I'd default to if Alex says "depends."

### B4 — Resurface scheduler (system-picked dates) [needs Q3=system, Q4=cadences]
Add `next_resurface_at: timestamp` on Lead. Cloud Function trigger on `stage` / `client_status` changes sets it using the cadences from Q4. "Resurface today" dashboard card lists leads whose date has come up, with one-click "mark contacted" (bumps date forward 30d) / "snooze 7d" / "open detail." Estimated **2d**.

### B5 — Marlow resurface daily brief [needs Q3=Marlow]
No `next_resurface_at` field. Daily Cloud Function (already exists for `scheduled_followups`) generates a Marlow brief: he reads stage + last_contacted + recent activity_log signals and produces a ranked "leads to resurface today" list in chat. Alex confirms individually or batch. Estimated **2d**. Adaptive — no hardcoded cadence to maintain.

### B6 — Marlow tools (single-lead) [needs B1 or B3]
- `update_lead` — email, category, tags, client_status (single lead)
- `search_leads` — read-only query
- `snooze_lead` — set `client_status: "snoozed"`, optional `next_resurface_at`
- `mark_resurfaced` — bumps `next_resurface_at` forward

Each tool maps to an existing callable. ~1d.

### B7 — Marlow tools (bulk) [needs B1/B3 + tag_index from A7]
- `bulk_tag` — filter + tag application across many leads

Confirmation behavior depends on B1 vs B3 path. ~½d.

### B8 — Marlow start_scrape tool [needs Q5=yes]
- `start_scrape` — kicks off a scrape with given params + optional `default_tags`

Always behind a confirmation card regardless of B1/B3 (high blast radius). ~½d.

---

## Section C — Ship order + critical path

### Phase 0 — Today (parallelizable)

While developer time is unblocked, do these three things in parallel:

1. **Walk to Alex** (30 min). Ask Q1–Q5. Write his verbatim answers somewhere persistent (this doc, a PR description, anywhere).
2. **PR1: A1 + A2 + A3 + A4 + A15** — editable email, editable category dropdown, recently-added filter + Added column, audit-log actor extension. Pure frontend except A15. **~2d, ships immediately.** This is Alex's first visible win.
3. **PR2 (backend, in parallel with PR1): A11 + A12 + A13** — Cloud Function telemetry endpoint, VPS posting, type extension. **~1.5d.** No UI yet but the data starts flowing.

### Phase 1 — Days 3-4

4. **PR3: A14** — `/scrapes` page lights up using the data from PR2. **~1d.**
5. **PR4: A5 + A6 + A7 + A8 + A9 + A10** — full tagging system end-to-end (data model, normalization, trigger, smart suggest, lead-detail input, scrape-time default tags). **~2.5d.**

By end of day 4: Alex has editable email, editable category, recently-added view, smart tagging working end-to-end, AND a dedicated scrapes page with live progress. Five of six features shipped without touching Marlow.

### Phase 2 — Days 5-7 (Alex-input-gated)

By now Alex's answers are in. Pick the path:

- **Most likely (Q1=tiered):** **PR5 = B3 (Marlow framework, tiered, 2.5d) + B6 (single-lead tools, 1d) + B7 (bulk_tag, 0.5d).** ~4d.
- **If Q1=execute:** **PR5 = B1 + B6 + B7.** ~3.5d.
- **If Q1=stage:** **PR5 = B2 + B6 + B7.** ~3.5d.

### Phase 3 — Days 8-9

- **PR6: B4 or B5** — resurface, whichever path Alex picked. ~2d.
- **PR7 (optional): B8** — `start_scrape` tool, if Q5=yes. ~0.5d.

### Critical path / 5-minute things that get forgotten

- **Firestore security rules for `tags`** — operator can write to leads they own; tag_index is system-only. Add to `firestore.rules` in PR4.
- **Bearer token rotation for the VPS endpoint** — A11 needs a secret on the VPS. Plan rotation cadence before deploy.
- **Resend inbound routing if email is edited** — if Alex changes a lead's email after a draft is sent, the reply still routes via the `reply+{lead_id}@...` plus-address, so no impact. Confirm before A1 ships.
- **Marlow confirmation card UX** (B3/B2) — modal? Inline in chat? Block input until resolved? Sketch before PR5.
- **Day 4 checkpoint** — if PR4 (tagging end-to-end) hasn't merged by end of day 4, descope smart-suggest (A8) to a follow-on PR; tagging works without it.
- **Day 5 Marlow-tool-share check** — once Marlow tools are live, count `activity_log` entries with `actor: "marlow"` vs `actor: "alex"`. If Marlow share <20% after a week, the tool primitive is wrong and we revisit.

---

## TL;DR

- **Section A (14 iterations, ~5d) can start today.** No questions for Alex required. Ships five of six features.
- **Section B (8 iterations, ~6d) needs Alex's answers to 5 questions** — collectible in one 30-min conversation. Shapes the Marlow tool primitive and resurface mechanism.
- **Critical decision: Q1 (execute vs stage vs tiered).** The council's verdict was "default to tiered if Alex says 'depends', otherwise follow what he literally says."
- **Total: ~9–11 working days** depending on Alex's answers. Front-loaded with visible value; the load-bearing Marlow decision happens before any Marlow code is written.

---

## Section D — Beta catch-up (from Chantal's BETA_PLAN.md, 2026-06-17)

The BETA_PLAN cross-references against what's already in main. Several items from Alex's five are already shipped (smart tagging, editable category + emails, /scrapes page, Marlow tools). The remaining beta-blockers and goal-relevant items live here.

### D1. Analytics "Leads by Category" cut off / horizontal scroll fix 🔴 Beta
**File:** `frontend/src/app/analytics/page.tsx` (treemap container).
**Fix:** add `overflow-x-auto` + min-width on the container so right-hand category cards (Events, Membership Clubs, Luxury Food Retail, etc.) become reachable.
**Effort:** ~30 min. No data changes.

### D2. Generation Log items unclickable 🔴 Beta
**File:** `frontend/src/app/log/page.tsx` (the Diagnostics → Generation Log list).
**Fix:** restore click handler on log row → opens detail dialog or routes to `/log/{id}`. Likely regression from a prior PR.
**Effort:** ~1 hr (depending on whether detail view still exists).

### D3. Weak/strong fit contrast 🟠 Goal-relevant (pulled into Beta)
**Files:** `lead-detail-dialog.tsx` (existing `FIT_COLORS` map), `leads-table.tsx`, message-card components.
**Fix:** traffic-light recolor on `menu_fit` badges so the operator can scan for "strong" instantly:
  - `strong` → **green** (`bg-emerald-500/20 text-emerald-300 border-emerald-500/40`)
  - `moderate` → **orange** (`bg-amber-500/20 text-amber-300 border-amber-500/40`)
  - `weak` → **red** (`bg-rose-500/20 text-rose-300 border-rose-500/40`)
  - `unknown` → muted slate (no change)
**Why it ties to the One Goal:** "spot the best leads fast" — high-contrast strong/weak is what makes the ranked worklist (D5) usable in a glance.
**Effort:** ~45 min.

### D4. Recently-added — finish the filter chip + "Added" column 🔴 Beta
**Status:** NEW pill + 6-option sort dropdown already shipped (commit `cf72475`). The BETA_PLAN wants more: a persistent **Today / 7d / 30d** filter chip AND an **"Added" column** with relative time, AND the old 24h dismissible banner removed.
**Files:** `frontend/src/app/leads/page.tsx` (add chip filter), `frontend/src/components/leads-table.tsx` (add Added column), remove banner block from `leads/page.tsx:219-609`.
**Open Q before shipping:** should the sort dropdown's existing "Recently added (24h)" + "Last 7 days" options stay, or be merged into the new filter chip? Recommend: **keep both** — chip controls the visible-set filter, sort controls ordering within it.
**Effort:** ~1 hr.

### D5. Composite priority score — prototype baseline 🟠 Goal-relevant (pulled into Beta if formula nods through)

**What this is:** the section 3A "best accounts first" feature. A single number per lead = fit × volume potential. Used to rank the leads worklist so Alex's outreach hour starts on the highest expected-revenue accounts.

**Prototype formula** (intentionally simple — meant to be tweaked):

```
priority_score = fit × volume_potential

where:
  fit            = (lead.score || 0) × menu_fit_multiplier
  menu_fit_multiplier = 1.15 if "strong" else 0.7 if "weak" else 1.0
  volume_potential   = clamp(0..10) of: category_volume_base + linkedin_size_boost + multi_site_boost
```

**Category volume base table (proposal, 0–10):**

| Category | Base |
|---|---|
| restaurant_groups | 10 |
| hotel_bar, airlines_trains | 9 |
| membership_clubs, festival_operators, events_catering | 8 |
| film_tv_theatre, cookery_schools, yacht_charter, corporate_gifting, wholesaler | 7 |
| subscription_boxes, cocktail_bar, wine_bar | 6 |
| italian_restaurant, gastropub, rtd, grocery | 5 |
| bottle_shop, luxury_food_retail | 4 |
| deli_farm_shop | 3 |
| default / unknown | 4 |

**LinkedIn company-size boost** (when present): 10,001+ → +3; 1,001-5,000 → +2; 201-1,000 → +1.5; 51-200 → +1; 11-50 → +0.5; else +0.

**Multi-site keyword scan on `business_summary`** for: `group`, `groups`, `locations`, `chain`, `sites`, `venues across`, `venues in`, `portfolio`, `across london`, `across the uk`, `multi-site`, `branches`. 0 hits → +0, 1 hit → +1, 2+ → +2.

**Tier thresholds:**
- High: score ≥ 50
- Medium: 25 ≤ score < 50
- Low: score < 25

**Files to add:**
- New `frontend/src/lib/priority-score.ts` — pure functions `volumePotential(lead)`, `priorityScore(lead)`, `priorityTier(n)`. No IO, fully unit-testable.
- `frontend/src/app/leads/page.tsx` — add 7th sort option: **"Highest priority"** (composite score desc, tiebreak `created_at` desc).
- `frontend/src/components/leads-table.tsx` — optional small Priority badge (High/Medium/Low colored chip) next to score.
- Dashboard "Top 10 Eligible" stays on its existing outreach-plan ranking for now — separate concern owned by `outreach-plan.tsx`.

**Tweakability:** the entire formula lives in one ~80-line file. Any field, weight, or threshold is a one-line edit. No DB migration, no server change. Reverting = delete one sort option + one file.

**Effort:** ~1.5 hr (util + sort wiring + tier badge). No spec call needed to start — the baseline is the thing to react to.

### D6. Sidebar Inbox de-dup 🟡 Fast-follow (cheap freebie)
**File:** `frontend/src/lib/nav-items.ts` — `Inbox` sidebar entry is redundant with the Inbox tab inside Review.
**Fix:** remove the standalone Inbox entry; keep it accessible from within Review's top nav.
**Effort:** ~10 min.

### D7. Collapsible stale-enrichment panel 🟡 Fast-follow (cheap freebie)
**File:** `frontend/src/components/stale-leads-card.tsx` — already has a `collapsed` state from the Rules-of-Hooks fix; add a default-collapsed pref when the panel is empty or older than N days.
**Effort:** ~20 min.

### D8. Items NOT pulled into Beta (per Chantal's plan)
Listed for tracking only — these are fast-follow polish, not Beta blockers:
- Dashboard layout / lead info to right sidebar (img-003)
- Card alignment / distribution (img-004)
- Header typography (img-005)
- Address autofill on scrape form (img-007)
- Team Metrics padding (img-009)
- AI Cost chart contrast (img-010)
- Contextual tooltips
- Marlow ↔ Ronny convergence (strategic, parallel track)
- Resurfacing engine build (spec drafted, needs Rob's 3 calls before any code)

---

### Section D shipping order (~3.5 hr to clear all 🔴 + 🟠)

| Order | Item | Effort | Risk |
|---|---|---|---|
| 1 | D1 — Analytics horizontal scroll | 30 min | Trivial CSS |
| 2 | D3 — Fit-badge contrast | 45 min | Trivial color tokens |
| 3 | D2 — Generation Log click handler | 1 hr | Depends on detail view existing |
| 4 | D4 — Recently-added filter + Added column + drop banner | 1 hr | Existing sort options kept; banner removal is the only delete |
| 5 | D5 — Composite priority score prototype | 1.5 hr | Pure additive; baseline ready to tweak |
| Bonus | D6 — Inbox de-dup | 10 min | Trivial |
| Bonus | D7 — Default-collapsed stale panel | 20 min | Trivial |

**Total:** clears every 🔴 and 🟠 from Chantal's plan within ~3.5 hours; bonus polish if time permits.
