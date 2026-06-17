# Operator-loop testing plan

End-to-end manual + automated test checklist for the operator-loop polish work. Use this when verifying a deploy or signing off a PR.

This plan reflects the locked design decisions: **NEW pill** instead of filter-chip/added-column, **6-option sort dropdown**, **TagInput** as a reusable smart-suggest chip-input, **dedicated /scrapes page** showing live progress with the currently-being-scraped venue name, and **Marlow tools with preview + confirm always**.

**Out of scope until tech lead approves:** resurface timing system, `mark_resurfaced` and `start_scrape` Marlow tools.

---

## 0. Setup

### Env vars

| Variable | Where | Purpose |
|---|---|---|
| `SCRAPE_PROGRESS_TOKEN` | Firebase Functions config (`firebase functions:config:set scrape.progress_token="..."`) | Bearer-token shared secret for `recordScrapeProgress`. **Must be set before deploy** or the endpoint returns 500. |
| `SCRAPE_PROGRESS_URL` | VPS env | Cloud Function URL the Python scraper POSTs telemetry to. |
| `SCRAPE_PROGRESS_TOKEN` | VPS env | Same bearer token, sent in `Authorization: Bearer` header. |

### Local dev

```bash
cd frontend && npm run dev          # http://localhost:4000
firebase emulators:start --only functions   # local Cloud Functions
```

### Test data prerequisites

- At least 3 leads across different `stage` values and `created_at` spread over the last 30 days
- At least 1 `current_account` lead (for tagging/category testing without polluting outreach)
- At least 1 completed `scrape_runs` doc and 1 failed one (for `/scrapes` history view)
- Optional: 2-3 leads sharing the same `batch_id` and `created_at` within the last 24h (for NEW pill cohort testing)

---

## 1. Backend smoke (automated + post-deploy)

### 1.1 Tag util — automated
```bash
node /tmp/smoke-tag-utils.mjs
```
Expect `20 passed, 0 failed (20 total)`. Mirror any change in `tag-utils.ts` into the smoke script.

### 1.2 Project type check — automated
```bash
cd frontend && npx tsc --noEmit
```
Expect zero errors in any operator-loop file. Pre-existing errors in `outreach-timeline.test.tsx` (missing `@testing-library/react` types) are unrelated.

### 1.3 Cloud Functions parse + load — automated
```bash
cd functions && node --check index.js
cd functions && node -e "import('./index.js').then(m => console.log(typeof m.recordScrapeProgress, typeof m.onLeadWrite_updateTagIndex, typeof m.executeMarlowAction))"
```
All three exports print `function`.

### 1.4 `recordScrapeProgress` endpoint — post-deploy curl
```bash
TOKEN="<SCRAPE_PROGRESS_TOKEN>"
URL="https://<region>-<project>.cloudfunctions.net/recordScrapeProgress"
RUN_ID="<existing-run-id>"

# 401 without token
curl -i -X POST -H "Content-Type: application/json" \
  -d "{\"run_id\":\"$RUN_ID\",\"phase\":\"scrolling\",\"progress_pct\":42}" "$URL"
# Expect: HTTP/2 401, {"error":"unauthorized"}

# 400 without run_id
curl -i -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"phase":"scrolling"}' "$URL"
# Expect: HTTP/2 400, {"error":"missing_run_id"}

# 200 happy path — includes current_lead
curl -i -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"run_id\":\"$RUN_ID\",\"phase\":\"extracting\",\"progress_pct\":62,\"current_lead\":\"The Forge Bar\",\"current_query\":\"cocktail bars in clapham\",\"leads_found\":47}" "$URL"
# Expect: HTTP/2 200, {"ok":true}
# Verify: scrape_runs/{RUN_ID} now has phase + progress_pct + current_lead + current_query + leads_found + progress_updated_at

# Bad phase silently ignored
curl -i -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"run_id\":\"$RUN_ID\",\"phase\":\"bogus\"}" "$URL"
# Expect: HTTP/2 200; phase field not updated

# Out-of-range progress ignored
curl -i -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"run_id\":\"$RUN_ID\",\"progress_pct\":150}" "$URL"
# Expect: HTTP/2 200; progress_pct field unchanged
```

### 1.5 `tag_index` trigger — Firestore console walk-through

Set `lead.tags` field manually in Firestore Console; tail `tag_index/counts`:

| Step | Lead `tags` field | Expected `tag_index/counts` |
|---|---|---|
| 1. Lead has no tags | (unset) | unchanged |
| 2. Set `tags: ["south-london"]` | `["south-london"]` | `{ "south-london": 1 }` |
| 3. Create second lead with `tags: ["south-london", "xmas-2026"]` | n/a | `{ "south-london": 2, "xmas-2026": 1 }` |
| 4. Remove `xmas-2026` from second lead | `["south-london"]` | `{ "south-london": 2, "xmas-2026": 0 }` |
| 5. Delete first lead | n/a | `{ "south-london": 1, "xmas-2026": 0 }` |
| 6. Edit lead's `business_name` (no tag change) | unchanged | counts unchanged (trigger short-circuits) |

### 1.6 `actor` field on audit log — post-deploy verification

Trigger each path once and inspect the most recent `activity_log` doc:

| Action | Endpoint | Expected `actor` |
|---|---|---|
| Assign leads via UI | `assignLeads` callable | `"user"` |
| Unassign leads via UI | `unassignLeads` callable | `"user"` |
| Email forwarded to ingest address | Resend webhook | `"system"` |
| Reply received via Resend | Resend webhook | `"system"` |
| Log a manual reply | `logReply` callable | `"user"` |
| Update lead outcome | `updateLeadOutcome` callable | `"user"` |
| Marlow executes a tool (any of the 4) | `executeMarlowAction` callable | `"marlow"` |

---

## 2. Lead detail dialog — editable fields

**Path:** `/leads` → click any lead → detail dialog opens.

### 2.1 Editable email

| Check | Expected |
|---|---|
| Email field has pencil-edit affordance | ✅ |
| Pencil → input + save/cancel buttons appear | ✅ |
| Save valid `alex@test.com` | Persists to `lead.email`; mailto link uses new value |
| Save invalid `not-an-email` | Sonner `toast.error`; no Firestore write |
| Save empty string | Writes `null` |
| Cancel button reverts to original | No Firestore write |
| Close dialog mid-edit | No write |

### 2.2 Editable contact_email

| Check | Expected |
|---|---|
| New "Contact email" row visible (was hidden before) | ✅ |
| Same pencil-edit affordance | ✅ |
| Same regex validation + null on empty | ✅ |

### 2.3 Editable venue_category dropdown

| Check | Expected |
|---|---|
| Category badge has pencil-edit affordance | ✅ |
| Click → shadcn `<Select>` with all 20 venue categories from `app/api/enrich/route.ts` | ✅ |
| Change `cocktail_bar` → `wine_bar` → Save | Firestore writes `venue_category` AND clears `enrichment.venue_category` (so override survives re-enrichment) |
| Cancel preserves original | ✅ |

### 2.4 Tag chip input (Phase B-ε)

| Check | Expected |
|---|---|
| Tags section visible in dialog with `<TagInput>` mounted | ✅ |
| Adding "south london" → chip shows `south-london` (canonical) | ✅ normalization |
| Typing partial match surfaces existing tags from `tag_index` | ✅ |
| Typing typo (`xmass-2026` when `xmas-2026` exists) shows "did you mean xmas-2026" | ✅ Levenshtein-1 |
| Removing a chip writes the trimmed `tags` array | ✅ |
| `tag_index/counts` increments on add, decrements on remove | ✅ backend |

---

## 3. Leads list

**Path:** `/leads`.

### 3.1 "NEW" pill — three-rule visibility

| Check | Expected |
|---|---|
| Amber pill labeled "NEW" appears next to `business_name` on freshly-added leads | ✅ |
| Pill present only when ALL three: `created_at` within last 24h AND in latest cohort AND not in viewedSet | ✅ |
| Latest cohort = leads sharing the most-recent `batch_id` (fallback: within 1h of max `created_at`) | ✅ |
| Open a NEW-pill lead in the detail dialog → close → pill GONE on that row | ✅ per-user dismiss |
| Open the same lead in a different browser (different uid in localStorage) → pill still shows | ✅ per-user isolation |
| When a newer batch arrives, prior-cohort pills disappear automatically | ✅ |
| After 24h, pill expires regardless | ✅ |

### 3.2 Sort dropdown — 6 options

Default: **Newest first**. Select each option and verify:

| Option | Expected order |
|---|---|
| Newest first | `created_at` desc; nulls last |
| Oldest first | `created_at` asc; nulls last |
| Recently added (24h) | filter to last 24h, then newest first |
| Last 7 days | filter to last 7d, then newest first |
| Highest score | `score` desc (nulls last), tiebreak `created_at` desc |
| Needs attention | enrichment_status ≠ "success" OR (>14d old AND no email); then newest first |

| Check | Expected |
|---|---|
| URL search param updates (`?sort=...`) on change; default omitted | ✅ |
| Refresh preserves the selected sort | ✅ |
| Sort + existing Stage/Source filters compose correctly | ✅ |
| Pagination still works under each sort | ✅ |
| Existing 24h "new leads" banner still appears | ✅ regression |

---

## 4. `/scrapes` page

**Path:** `/scrapes` (sidebar nav → Scrapes, breadcrumb "Scrapes").

### 4.1 Live section

| Check | Expected |
|---|---|
| When no `scrape_runs` doc has `status: "running"`: shows "No scrapes in progress." | ✅ |
| When a run is running: live card visible with — progress bar from `progress_pct`, phase chip (warmup/scrolling/extracting/saving/done with color), "Currently scraping: **{current_lead}**" ONLY in extracting phase, "Query: {current_query}", leads-found count, "started Xm ago" | ✅ |
| Progress updates every ~15s as VPS posts new telemetry (no manual refresh) | ✅ |
| Dismiss button calls `dismissScrapeRun()`; card disappears from live section | ✅ |
| Dismissed runs hidden even while `status === "running"` | ✅ |

### 4.2 History section

| Check | Expected |
|---|---|
| Last 50 non-running runs listed newest first | ✅ |
| Each row: source · query · status badge · leads-found · duration · started-Xm-ago | ✅ |
| Failed runs flagged with red `<Badge>destructive</Badge>` + error string below | ✅ |
| "Re-run with same params" button on failed rows shows toast (full wiring is a follow-up) | ✅ |
| Empty history: "No past scrapes yet." | ✅ |

### 4.3 Navigation regression

| Check | Expected |
|---|---|
| Sidebar has "Scrapes" entry under SYSTEM_NAV (between Sommelier and Diagnostics) with Radar icon | ✅ |
| Breadcrumb on `/scrapes` shows "Scrapes" | ✅ |
| Existing PipelineActivity banner on dashboard still works | ✅ regression |

---

## 5. Scrape control — default tags (Phase B-ε)

**Path:** Dashboard → Scrape control panel.

| Check | Expected |
|---|---|
| "Default tags" `<TagInput>` field visible in scrape parameters | ✅ |
| Same autocomplete behavior (dedupe + near-match) as on lead detail | ✅ |
| Triggering a scrape writes the chosen tags to `scrape_runs/{run_id}.default_tags` | ✅ backend |
| Scraping with no default tags still triggers successfully (regression) | ✅ |

**Note:** The actual application of `default_tags` to each scraped lead is a Python-side change in Phase C — verify that separately under §6 below.

---

## 6. VPS scraper telemetry (Phase C-ζ)

**Path:** Trigger any scrape from `/scrape`.

| Check | Expected |
|---|---|
| Within 30s of scrape start: `scrape_runs/{run_id}` has `phase`, `progress_pct`, `progress_updated_at` populated | ✅ |
| Updates land every ~15s during the run (throttled by ProgressReporter) | ✅ |
| `current_lead` populates during "extracting" phase with the venue name | ✅ |
| When VPS finishes: final write sets `phase: "done"` with `force=True`; `status: "completed"` follows | ✅ |
| Missing `SCRAPE_PROGRESS_TOKEN` env on VPS: scrape still runs, telemetry no-ops gracefully | ✅ resilience |
| Endpoint returns 401: warning logged, scrape continues | ✅ resilience |
| Network failure mid-scrape: warning logged, scrape continues, next post attempts again | ✅ resilience |

---

## 7. Marlow tools (Phase D)

**Path:** Sidebar → Marlow (`/settings/prompt-coach`).

### 7.1 Suggestion pills (empty state)

Each pill maps 1:1 to a Marlow operation. Drops the prompt text into the chat input (no auto-send).

| Pill | Maps to | Drops into input |
|---|---|---|
| Tune Marlow's voice | `propose` (overlay) | "Make Marlow's drafts more " |
| Draft a message for… | existing draft flow | "Draft a message for " |
| Update a lead | `update_lead` | "Change {lead name}'s category to " |
| Find leads… | `search_leads` | "Find leads with no email after 7 days" |
| Tag a batch of leads | `bulk_tag` | "Tag every cocktail bar in Brixton as south-london" |
| Snooze a lead | `snooze_lead` | "Snooze {lead name} for 2 weeks" |

| Check | Expected |
|---|---|
| Empty conversation shows 6 amber pills | ✅ |
| Click pill → corresponding text drops into the chat input (NOT auto-sent) | ✅ |
| Pills disappear once the first user message is sent | ✅ |

### 7.2 Action buttons — preview + confirm always

Send Marlow a message that triggers each action type and verify:

| `envelope.action` | Buttons shown | On Proceed |
|---|---|---|
| `chat_only` | (no buttons — plain chat) | — |
| `propose` (overlay) | Activate overlay · Save overlay · Simulate first · Don't proceed | Calls existing overlay callable |
| `simulate` | Run simulation · Don't proceed | Calls `simulateDraft` |
| `apply` | Apply · Don't proceed | Calls overlay apply |
| `save_and_schedule` | Save & schedule · Don't proceed | Calls overlay save+schedule |
| `escalate` | Escalate to founder · Don't proceed | Calls escalation flow |
| `update_lead` | Execute change · Don't proceed | `executeMarlowAction({action, plan})` |
| `search_leads` | (no buttons — auto-executes, results render inline) | Auto-call on receipt |
| `snooze_lead` | Snooze · Don't proceed | `executeMarlowAction(...)` |
| `bulk_tag` | Tag {N} leads · Don't proceed (N = `plan.target_count`) | `executeMarlowAction(...)` |

| Check | Expected |
|---|---|
| Preview card always shows `envelope.plan.summary` above the buttons | ✅ |
| "Don't proceed" dismisses the card, soft toast "Cancelled. Marlow can suggest something else." | ✅ |
| After Proceed success: toast + card collapses | ✅ |
| After Proceed error: `toast.error` + card stays so user can retry | ✅ |

### 7.3 Backend tool actions

For each new tool, verify the Firestore side-effect AND audit log:

| Tool | Trigger | Firestore write | activity_log entry |
|---|---|---|---|
| `update_lead` | "Change The Forge Bar's category to wine_bar" → Proceed | `leads/{id}.venue_category = "wine_bar"` | `actor: "marlow"`, `action: "marlow_update_lead"`, `lead_id`, `fields_changed`, `performed_by: {uid}` |
| `search_leads` | "Show me leads with no email after 7 days" | (read-only) | `actor: "marlow"`, `action: "marlow_search_leads"`, `query`, `result_count` |
| `snooze_lead` | "Snooze The Forge Bar for 2 weeks" → Proceed | `leads/{id}.client_status = "snoozed"` | `actor: "marlow"`, `action: "marlow_snooze_lead"`, `lead_id`, `performed_by: {uid}` |
| `bulk_tag` | "Tag every cocktail bar in Brixton south-london" → Proceed | `tags: arrayUnion("south-london")` on each matching lead | ONE entry: `actor: "marlow"`, `action: "marlow_bulk_tag"`, `lead_count`, `tag`, `performed_by: {uid}` |

### 7.4 Server-side safety

| Check | Expected |
|---|---|
| `update_lead` with field outside the allowlist (e.g. `score: 100`) → HttpsError | ✅ |
| `bulk_tag` with `target_ids.length > 500` → HttpsError | ✅ |
| `bulk_tag` with empty tag → HttpsError | ✅ |
| Any tool called without auth → "unauthenticated" HttpsError | ✅ |

---

## 8. Parked — DO NOT TEST until tech lead approves

- Resurface timing system (`next_resurface_at` field, scheduler, "Resurface today" card)
- `mark_resurfaced` Marlow tool
- `start_scrape` Marlow tool (Marlow kicking off scrapes himself)

---

## 9. Regression / cross-feature

| Check | Expected |
|---|---|
| Existing leads list loads and renders for leads with no tags (tags is optional) | ✅ |
| Existing scrape control still triggers scrapes when default_tags is empty | ✅ |
| Existing draft generation (`generateDrafts`) still works | ✅ |
| Existing Resend inbound webhook still creates `activity_log` entries (now with `actor: "system"`) | ✅ |
| Existing `assignLeads` / `unassignLeads` still work (now with `actor: "user"`) | ✅ |
| Existing PipelineActivity dashboard banner still shows live scrape | ✅ |
| Existing 24h "new leads" banner on `/leads` still appears | ✅ |
| Existing inline edit on website / business_name / menu_url still works | ✅ |

---

## 10. Performance / safety

| Check | Expected |
|---|---|
| `tag_index/counts` doc stays under Firestore 1MB limit (each entry ~30 bytes, allows 30k+ tags) | ✅ |
| `recordScrapeProgress` writes throttled to ~15s → ~120 writes per 30-min scrape, well within quota | ✅ |
| Smart-suggest autocomplete on 200+ known tags: input lag <50ms (Levenshtein over 200 strings is sub-5ms) | ✅ |
| `/scrapes` history renders 50 entries without scroll jank | ✅ |
| Marlow `bulk_tag` write batch fits in Firestore batch limit (500-doc cap enforced) | ✅ |
| Closing lead detail dialog mid-edit does not write partial state | ✅ |

---

## 11. Sign-off checklist

- [ ] Section 1 (backend) — all green
- [ ] Section 2 (lead detail) — all green
- [ ] Section 3 (leads list / NEW pill / sort) — all green
- [ ] Section 4 (`/scrapes` page) — all green
- [ ] Section 5 (scrape control default tags) — all green
- [ ] Section 6 (VPS telemetry) — all green
- [ ] Section 7 (Marlow tools) — all green
- [ ] Section 9 (regression) — all green
- [ ] Section 10 (performance) — all green
- [ ] Alex has clicked through `/scrapes` on a real scrape and confirmed live progress is clear
- [ ] Alex has edited a lead's email, category, and tags from the UI and confirmed persistence
- [ ] Alex has driven Marlow through a `bulk_tag` action end-to-end and confirmed the preview + confirm flow feels right
- [ ] Tech lead has answered the 3 parked questions (resurface mechanism, resurface cadences, Marlow start_scrape authority) before Phase 2 of resurface work begins

---

## 12. Beta catch-up (D1–D7) — manual test cases

These cover the items shipped from Chantal's BETA_PLAN.md on 2026-06-17.

### 12.D1 Analytics "Leads by Category" — donut chart
**Path:** `/analytics`

| # | Step | Expected |
|---|---|---|
| D1.1 | Load `/analytics` | Donut renders (not a treemap), center label shows total ("462 leads"), side legend lists categories |
| D1.2 | Top of legend | Cocktail Bar (or whichever is biggest), in proportion-descending order |
| D1.3 | Bottom of legend | "Other (N more)" gray row absorbing categories beyond the top 10 |
| D1.4 | Hover any wedge | Wedge pops outward slightly; tooltip card below chart shows count + % + score + conversion |
| D1.5 | Hover any legend row | Corresponding wedge highlights; legend row gets darker background |
| D1.6 | Hover "Other (N more)" row | Tooltip card shows aggregate count + "N categories" |
| D1.7 | Counts in legend sum to the center total | ✅ math is honest |
| D1.8 | Resize to ~600px wide | Layout stacks: donut on top, legend below (no horizontal scroll, no clipping) |
| D1.9 | If many categories (12+) | Legend gets internal scroll within max-height; donut never exceeds card width |
| D1.10 | No data state | "No category data yet." placeholder |

### 12.D2 Generation Log items clickable
**Path:** `/log` (Diagnostics → Generation Log)

| # | Step | Expected |
|---|---|---|
| D2.1 | Load `/log`, see list of records | Each row has a chevron at the left |
| D2.2 | Click any row | Row expands, chevron rotates from collapsed to open |
| D2.3 | Expanded row shows | "Subject" block + "Content · step N" block with full text |
| D2.4 | Click the same row again | Row collapses |
| D2.5 | Click a different row while one is open | Previous closes, new one opens (one-at-a-time) |
| D2.6 | Keyboard: Tab to a row, press Space/Enter | Row expands (button semantics work) |
| D2.7 | Empty content lead | Shows "(no content)" placeholder |

### 12.D3 Traffic-light fit contrast
**Visual scan across 5 surfaces:**

| Surface | Strong | Moderate | Weak | Unknown |
|---|---|---|---|---|
| Lead detail dialog (`/leads` → click a lead) | Green chip | Orange chip | Red chip | Muted slate chip |
| Leads table "Fit" column (`/leads`) | Green text | Orange text | Red text | Slate text |
| Dashboard "Top 10 Eligible" cards (`/`) | Green | Orange | Red | Slate |
| Outreach plan list (`/outreach`) | Green | Orange | Red | Slate |
| Message cards (`/review`) | Green pill | Orange pill | Red pill | Slate pill |

| # | Step | Expected |
|---|---|---|
| D3.1 | Open a known strong-fit lead in detail dialog | Green badge "strong fit" |
| D3.2 | Open a known weak-fit lead | Red badge "weak fit" — immediately distinguishable from strong |
| D3.3 | Scan the leads table | Strong fits read "halata" (instantly spottable) |
| D3.4 | Light mode (if available) | Colors still readable (no white-on-white) |

### 12.D4 Recently-added filter chip + Added column
**Path:** `/leads`

| # | Step | Expected |
|---|---|---|
| D4.1 | Default load | "Added:" chip group visible: **All time** (highlighted) · Today · 7d · 30d |
| D4.2 | URL has no `?recency=` initially | ✅ |
| D4.3 | Click **Today** | Only leads created in last 24h visible; URL gains `?recency=today` |
| D4.4 | Click **7d** | Only leads created in last 7 days; URL has `?recency=7d` |
| D4.5 | Click **30d** | Only leads created in last 30 days; URL has `?recency=30d` |
| D4.6 | Click **All time** | All leads visible; `?recency=` removed from URL |
| D4.7 | Refresh page with `?recency=7d` | Chip restores 7d state |
| D4.8 | Combine: recency=Today + Stage=enriched + Sort=Highest priority | All three compose correctly |
| D4.9 | Existing 24h "new leads" banner | Still appears for fresh leads (regression) |
| D4.10 | NEW pill on rows | Still works (regression) |

**Added column:**

| # | Step | Expected |
|---|---|---|
| D4.11 | New "Added" column appears between Postcode and Score | ✅ |
| D4.12 | Each row shows relative time | `45s ago`, `2m ago`, `3h ago`, `4d ago`, `2mo ago`, etc. |
| D4.13 | Hover any "Added" cell | Tooltip shows full absolute timestamp |
| D4.14 | Lead with no `created_at` AND no `scraped_at` | Shows "—" without crashing |
| D4.15 | Switch sort to "Newest first" | Added column values descend from top to bottom |

### 12.D5 Composite priority score
**Path:** `/leads`

| # | Step | Expected |
|---|---|---|
| D5.1 | Sort dropdown contains **"Highest priority"** option (3rd from top) | ✅ |
| D5.2 | Select "Highest priority" | URL gains `?sort=highest_priority` |
| D5.3 | Top of the list | A strong-fit `restaurant_groups` lead (if any) ranks above a strong-fit `cocktail_bar` |
| D5.4 | A strong-fit lead with score 8 in `restaurant_groups` | Should outrank a strong-fit lead with score 8 in `deli_farm_shop` by ~3× |
| D5.5 | A weak-fit lead with score 8 | Should rank BELOW a strong-fit lead with score 6 in same category (multiplier inverts ranking) |
| D5.6 | A lead with `score: null` | Priority badge hidden; lead drops to bottom of priority sort |

**Priority badge (in leads table Score column):**

| # | Step | Expected |
|---|---|---|
| D5.7 | High-priority lead (score ≥ 50) | **Green "High"** badge next to score |
| D5.8 | Medium-priority lead (25–49) | **Orange "Med"** badge |
| D5.9 | Low-priority lead (< 25) | **Slate "Low"** badge |
| D5.10 | Lead with priority = 0 (no score) | No badge shown |
| D5.11 | Hover the badge | Tooltip shows `Priority: 47.2 (Med)` (exact number) |

**Smoke test of the formula** (already passing locally — re-run if formula edited):
```bash
node -e '<contents of the 5-case smoke from session>'
```
Expected output:
- `strong-fit restaurant_groups → 92`
- `strong-fit deli_farm_shop → 27.6`
- `weak-fit cocktail_bar → 21`
- `restaurant_groups w/ multi-site keyword → 80.5`
- `no score → 0`

**Tweakability check:**

| # | Step | Expected |
|---|---|---|
| D5.12 | Open `frontend/src/lib/priority-score.ts` | All weights live in one file (CATEGORY_VOLUME table, MULTI_SITE_KEYWORDS array, fitMultiplier ladder, tier thresholds) |
| D5.13 | Change `cocktail_bar` base from 6 → 9 and refresh | Cocktail bars climb the ranking immediately, no DB migration |

### 12.D6 Sidebar Inbox — kept (de-dup reverted)
**Path:** any page with the sidebar

| # | Step | Expected |
|---|---|---|
| D6.1 | Sidebar shows | Dashboard · Leads · Review · Inbox · Campaigns · Clients · Marlow · Analytics |
| D6.2 | Standalone "Inbox" entry between Review and Campaigns | Present |
| D6.3 | Click Review → Inbox top-nav tab | Inbox also reachable from inside Review (both paths work) |
| D6.4 | Notification badge for unread replies | On the **Inbox** sidebar entry |

**Note:** BETA_PLAN flagged this as redundant, but in practice Inbox is a primary destination so the entry stays.

### 12.D7 Stale-enrichment panel collapsed persistence
**Path:** `/` (Dashboard)

| # | Step | Expected |
|---|---|---|
| D7.1 | First-ever visit, browser has no `stale-leads-card:collapsed` key | Panel renders expanded (default state preserved) |
| D7.2 | Click the chevron to collapse | Panel collapses; localStorage gains key `stale-leads-card:collapsed: "1"` |
| D7.3 | Refresh the page | Panel stays collapsed |
| D7.4 | Click chevron to expand | localStorage updates to `"0"` |
| D7.5 | Refresh | Panel stays expanded |
| D7.6 | Open in incognito | Panel back to default (per-browser preference) |
| D7.7 | If the "no stuck leads" empty state shows (green CheckCircle banner) | Collapsed state is irrelevant — empty state always renders inline |

---

### Cross-cutting regression checks

| # | Step | Expected |
|---|---|---|
| R.1 | Existing NEW pill, 24h banner, sort dropdown on `/leads` | Still work alongside new recency chip and Added column |
| R.2 | Tag chip input on lead detail | Still works (regression) |
| R.3 | Editable category dropdown on lead detail (now in Contact + Location section) | Still works (regression) |
| R.4 | `/scrapes` page | Still loads with live progress + history (regression) |
| R.5 | Marlow chat suggestion pills | Still show updated set (Tune Marlow's voice / Draft a message for… / Update a lead / Find leads… / Tag a batch of leads / Snooze a lead) |
| R.6 | StaleLeadsCard Rules-of-Hooks warning | Still gone (regression — fix held) |

---

### D-section sign-off

- [ ] D1–D7 all green per matrices above
- [ ] Visual scan of leads list: strong fits read instantly, weak fits read instantly
- [ ] Visual scan: "Highest priority" sort surfaces the right kind of accounts at top
- [ ] No console errors during the click-through
- [ ] `npx tsc --noEmit` from `frontend/` returns 0 new errors (4 pre-existing in `outreach-timeline.test.tsx` are OK)
- [ ] Alex (or you on Alex's behalf) has clicked through D5 sorts and the priority badges make sense before sending to him for live use
