# Operator-loop polish — three execution proposals

## Background

Post-Marlow, Alex and I identified six gaps in the operator loop:

1. **Smart tagging + editable category** — Gemini misclassifies venues; no campaign groupings (south-london, xmas, discount-eligible)
2. **Recently added — persistent** — 24h banner disappears once dismissed; no stable "what came in this week"
3. **Editable email addresses** — read-only today (`lead-detail-dialog.tsx:421-426`)
4. **Dedicated scrapes view** — scraping is a black box; VPS knows phase+% but doesn't persist; failures get lost
5. **Resurface timing** — cold cadence exists (`functions/followup-logic.js`, 4/8/12/102d) but skips engaged leads with no signal back to operator about when to circle back warmly
6. **Marlow tools** — Marlow today is advise-only (`functions/index.js:6837`, "never side-effects on his own"); Alex wants to ask him to do things

All three proposals deliver the same six features. What differs is **shape, sequence, where complexity lands, and what bet we're making about how Alex actually operates**.

---

## Proposal A — Hands-on console (UI-first, distributed)

**Bet:** Alex is a hands-on operator. He wants controls where he already is — leads list, lead detail, dashboard. Marlow is a power-user accelerator, not the primary surface.

**Shape:**
- **Tagging:** editable category dropdown (21-value Gemini enum) + free-form tags chip input, both inline on `lead-detail-dialog.tsx`. Scrape-time default tags on `scrape-control.tsx` → `scrape_runs.default_tags` → applied at lead-write time. Smart suggest via Firestore `tag_index` doc updated by trigger; normalization (lowercase, hyphen-collapse, punctuation-strip) + Levenshtein near-match.
- **Recently added:** filter chip (Today / 7d / 30d / All) + sortable "Added" column on `leads-table.tsx`. Existing 24h banner stays. No new page.
- **Email edit:** replicate the website inline-edit pattern (`lead-detail-dialog.tsx:436-486`) for `email` and `contact_email`.
- **Scrapes:** new `/scrapes` page. Live section (running runs as cards: progress bar, phase, current query, leads-so-far, cancel) + History section (failed runs flagged + re-run button). VPS posts phase/`progress_pct`/`current_query` every ~15s to a Cloud Function endpoint → Firestore.
- **Resurface:** new `next_resurface_at` field, populated on stage transitions (in_discussion → 14d, current_account → 90d, snoozed → 30d, tunable). Dashboard "Resurface today" card with one-click "mark contacted" / "snooze 7d" / "open."
- **Marlow tools:** allowlist of 6 tools (`update_lead`, `bulk_tag`, `snooze_lead`, `start_scrape`, `mark_resurfaced`, `search_leads`) mapped to existing callables. Every action logs to `activity_log` with `actor: "marlow"`. Anything touching >5 leads or sending email returns a confirmation card.

**Ship order:** PR1 email-edit + recently-added (½d) → PR2 tagging (2d) → PR3 scrapes page (2d) → PR4 resurface card (2d) → PR5 Marlow tools (2d). **Total ~9d.**

**Strengths:** Alex sees something new every PR. Each piece independently valuable. Standard UI patterns Alex already knows. Marlow risk contained — ships last on top of well-tested surfaces.

**Weaknesses:** Most UI surfaces to maintain. Marlow conversational experience is 2 weeks out. Some duplication between UI controls and Marlow tools.

---

## Proposal B — Marlow-as-OS (agent-first, conversational primary)

**Bet:** Tedious lookups, batch operations, and "remember to circle back" are the actual bottlenecks. UI mutation surfaces don't scale — there's always a workflow they don't cover. Make Marlow the way you *do things*; UI just shows state.

**Shape:**
- **PR1 (foundation, 2d):** Marlow tool framework. Extend the current envelope (`functions/index.js:6754`) from advise-only to a tool-use loop. Allowlist registry, audit-log shape with `actor: "marlow"`, confirmation cards for destructive/bulk actions. No tools yet — pure framework.
- **PR2 (read+write tools, 1d):** Plumb existing surfaces as tools: `update_lead`, `search_leads`, `snooze_lead`. Email + category editable via Marlow OR (free win) the inline pencil pattern on lead detail.
- **PR3 (tagging + scrapes, 2d):** Data fields land (`tags`, `tag_index`, scrape phase/progress). `bulk_tag` + `start_scrape` tools. UI is minimal: tag pills shown on lead cards (read-only), a thin scrape status indicator on the dashboard. Marlow narrates scrape progress in chat ("scrape at 60%, scrolling phase, 47 new leads"). No `/scrapes` page yet.
- **PR4 (resurface brief, 1d):** No `next_resurface_at` field. Instead, daily Marlow brief — he reasons over stage + last_contacted + signals and presents "leads to resurface today" in chat. Alex confirms each one or batch-confirms.

**Ship order:** PR1 → PR2 → PR3 → PR4. **Total ~6d.**

**Strengths:** Fewest moving UI parts. Marlow becomes the universal control surface — every future capability is just another tool, no new page. Resurface logic is adaptive, not hardcoded. Smallest day count.

**Weaknesses:** PR1 is invisible to Alex (~2 days of "nothing visible"). Marlow reliability is load-bearing — if he hallucinates `bulk_tag`, real data gets mangled (confirmation cards mitigate but don't eliminate). Conversational interfaces have real cost when you just want to *see* what came in this week. Less defensible if Alex prefers visual scanning over typing prompts.

---

## Proposal C — Data-spine first (foundation-heavy, then parallel build-out)

**Bet:** All six features touch the same data layer. The cleanest path is to land the spine once, well-tested, then UI and Marlow are thin wrappers on the same surface — no duplication, no rework.

**Shape:**
- **PR1 (spine, 3d, invisible):** Type changes (`tags`, `default_tags`, `next_resurface_at`, scrape phase fields). Firestore trigger for `tag_index` upkeep. Cloud Function endpoint for VPS scrape phase writes. `activity_log` shape extended with `actor` field. Resurface scheduler that sets `next_resurface_at` on stage transitions. Marlow allowlist scaffolding (tool registry, confirmation-card schema, audit shape) — no tools wired up yet. Unit-tested in isolation; nothing visible to Alex.
- **PR2 (UI broad, 2d):** Editable email + category dropdown + tags chip input on lead detail. Recently-added filter + Added column. Resurface dashboard card. PipelineActivity surfaces phase+% from the new fields. Everything lights up at once.
- **PR3 (UI dedicated, 1d):** `/scrapes` page (live + history).
- **PR4 (Marlow tools, 2d):** Wire the 6 allowlisted tools (`update_lead`, `bulk_tag`, `snooze_lead`, `start_scrape`, `mark_resurfaced`, `search_leads`) to the existing callables from PR1–3. Confirmation card flow already in framework.

**Ship order:** PR1 → PR2 → PR3 → PR4. **Total ~8d.**

**Strengths:** Least likely to need rework — UI and Marlow share the exact same surface, no drift. Testable in isolation; PR1 is pure backend, easy to QA. After PR2, *everything* visible at once — strong demo moment. Marlow tools "for free" because callables already exist.

**Weaknesses:** PR1 is ~3 days of nothing-visible-to-Alex. Hard to demo or get feedback on. If we discover an architectural issue mid-PR1, we've sunk days. Discipline-heavy — easy to scope-creep PR1 into a 5-day chunk.

---

## How to choose between them

| Axis                          | A (Console)   | B (Marlow-as-OS) | C (Spine)        |
|-------------------------------|---------------|------------------|------------------|
| Days to first visible value   | ½d            | ~3d              | ~5d              |
| Total days                    | ~9d           | ~6d              | ~8d              |
| Marlow reliability dependency | Low           | **High**         | Medium           |
| UI surface to maintain        | High          | Low              | Medium           |
| Demo-ability mid-build        | Continuous    | Late             | Big-bang at PR2  |
| Risk of rework                | Medium        | High             | Low              |
| Fits "click-driven operator"  | **Yes**       | No               | Yes              |
| Fits "ask-driven operator"    | OK            | **Yes**          | Yes              |

**Critical unknowns:**
1. Does Alex prefer clicking or asking? (Anecdotally: he asked for editable category dropdown + email edit + filters — that's a clicker, not an asker. But the Marlow request suggests both.)
2. How reliable is Marlow on bulk operations? Untested at scale.
3. Is the 3-day invisible PR1 of Proposal C acceptable to ship cadence?
4. Are there hidden dependencies between the six features we're missing?
