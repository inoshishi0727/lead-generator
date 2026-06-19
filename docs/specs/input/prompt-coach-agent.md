# Prompt Coach Agent — Spec

**Status:** Draft / input spec
**Owner:** Rob (admin), Alex (operator)
**Date:** 2026-06-12

## 1. Problem

Today the email writing instructions live in two places:

1. **Base system prompt** — `EMAIL_SYSTEM_PROMPT`, hardcoded in `functions/index.js:412`. Defines Rob's voice, product facts, hard rules (no em dashes, title-case product names, 7-step structure). Changing it means a code edit + `firebase deploy`.
2. **Overlay rules** — `prompt_config/email_rules` pointer → `versions/{id}.rules_md`, appended at runtime by `getPromptRules()` (`functions/index.js:372`, 15-min cache). Today these are auto-synthesized weekly from `edit_feedback`, and only an **admin** can flip the active version via the `setActivePromptVersion` callable.

Alex (operator, non-admin) cannot adjust anything without Rob or a deploy. But Alex needs to add **timely, lightweight context** the model should weave in:

- Weather / season hooks ("heatwave this week, push spritz serves").
- Live events ("Asterley Bros just joined a spirits contest — very exciting, prepping for it, mention the buzz").
- Month-specific campaigns ("Dry January low-ABV angle", "December gifting").

These are details, not voice or product-fact changes. They should be fast, conversational, reversible, and **must never let Alex overwrite Rob's base prompt or hard rules.**

## 2. Goal

A conversational **Prompt Coach** agent Alex talks to in plain English ("we're in a heatwave, lean into spritz this week"). The agent translates that into a structured **overlay** that gets appended to every generated email — without touching the protected base prompt.

Plus the ability to save, name, and switch between **overlay versions** (e.g. a "December gifting" overlay, a "Dry January" overlay) so Alex can prep months ahead and activate on a date.

## 3. Three-layer prompt model

The final system prompt sent to Claude is assembled at generation time as:

```
[ LAYER 1: BASE PROMPT ]        ← Rob / admin only. Protected.
        +
[ LAYER 2: SYNTHESIZED RULES ]  ← auto-generated weekly from feedback. admin-curated.
        +
[ LAYER 3: OPERATOR OVERLAY ]   ← Alex, via the Prompt Coach agent. NEW.
```

| Layer | What it holds | Who edits | How |
|-------|---------------|-----------|-----|
| 1. Base | Voice, product facts, hard rules, step structure | **Rob (admin) only** | Code or a future admin-only editor. Out of Alex's reach. |
| 2. Synthesized rules | Learned corrections from `edit_feedback` | System weekly; admin activates | Existing `prompt-rules` page + `setActivePromptVersion` |
| 3. Operator overlay | Timely context: weather, events, monthly angle | **Alex (operator)** | **Prompt Coach agent (this spec)** |

Layer 3 is **additive and subordinate**: it can add emphasis and context but cannot override Layer 1's hard rules. The base prompt gets a guard clause (see §6) stating that operator notes are context only and never override voice/format/product rules.

## 4. The Prompt Coach agent

### 4.0 Persona

The agent is **not raw Claude** — it has a fixed persona so Alex talks to a consistent character, not a generic assistant. Persona lives in the agent's meta-prompt (separate from `EMAIL_SYSTEM_PROMPT`, which is Rob's email-writing voice).

**"Marlow" — the Cellar Master.** House-style persona for Asterley Bros:

- **Role:** Keeper of the brand voice. Treats the base prompt as the "house recipe" — Marlow can season a batch (overlays) but never rewrites the recipe (base prompt) without Rob signing off.
- **Tone:** Warm, dry-witted, knows the drinks trade. Brief and practical, not corporate. Speaks like a trusted member of the team, not a chatbot.
- **Behaviour:** Confirms intent back in one line, states plainly when something is context-only vs a base-prompt change, always offers to simulate before applying.
- **Guardrail in persona:** Marlow is explicitly loyal to the house recipe. When asked to change foundational voice/product/rules, he says he can't on his own and offers to send it to Rob for sign-off.

Powered by **Claude** (`ANTHROPIC_API_KEY`, same secret as `generateDrafts`). Persona text is a constant in `functions/index.js` (e.g. `COACH_PERSONA_PROMPT`), admin-editable later.

### 4.1 Interaction

Alex opens a chat panel (new route, e.g. `/settings/prompt-coach`) and talks to Marlow:

> **Alex:** Heatwave incoming this week, want emails leaning into spritz serves and something light.
> **Marlow:** Right, summer's doing the selling for us. I'll add a seasonal emphasis: lead with spritz serves (Rosé Spritz, Rosé Americano), keep it light. This is seasoning, not the recipe — voice and product rules stay put. Want me to run it against a real lead before we pour it out?
> **Alex:** Yeah, test it on The Coach & Horses.
> **Marlow:** *(simulate mode)* Here's the draft that lead would get with the overlay on... [sample]. Happy with it? I can apply now or hold it for a date.
> **Alex:** Apply now.
> **Marlow:** Done. Overlay's live.

The agent is itself an LLM call (Claude) with a **meta-prompt** that knows:

- The shape of the base prompt and what is off-limits (it must refuse/deflect attempts to change voice, product facts, or hard rules — those route to Rob).
- How to convert Alex's intent into a tight overlay block (a few bullet lines, same `rules_md` markdown style).
- The available actions it can take (apply, save version, schedule, preview, revert).

### 4.2 What the agent CAN do

- Add/edit/remove **operator overlay** lines (weather, events, monthly angle, emphasis on a product or serve).
- Create a **named overlay version** ("December Gifting", "Dry January 2027").
- **Activate** an overlay now, or **schedule** it for a month/date range.
- **Simulate** — generate a sample draft against a **real lead** with the proposed overlay before committing (see §4.4).
- **Revert** to the previous overlay or clear it entirely.
- **Escalate** a foundational change to Rob for sign-off (see §4.5).

### 4.3 What the agent CANNOT do

- Touch Layer 1 (base prompt) or Layer 2 (synthesized rules). If Alex asks to change voice ("make it more formal", "stop saying banging"), drop a product, or relax a hard rule, the agent treats it as a **foundational change** and routes it to Rob for approval (see §4.5) rather than doing it.
- Bypass the no-em-dash / title-case / structure rules.

### 4.4 Simulate mode

Before any overlay goes live, Alex can test it against **real lead data** — same pipeline a real send uses, nothing fabricated.

- Alex picks a lead (or Marlow suggests a representative one by category) and the agent runs the **proposed overlay** through the actual generation path: `buildPrompt(lead, enrichment)` + `EMAIL_SYSTEM_PROMPT` + synthesized rules + **proposed overlay**.
- Output is a real sample draft, shown in chat, side-by-side with the **current** overlay's draft so Alex sees the delta.
- **Dry run only:** writes nothing to `outreach_messages`, no send, no `generation_log`. Pure preview.
- Backed by a `simulateDraft({ lead_id, overlay_md })` callable that reuses the `callDraftLLM` / `buildPrompt` internals but skips persistence.
- Alex iterates ("more contest buzz, less weather") and re-simulates until happy, then applies.

### 4.5 Foundational change → Rob's approval

A change is **foundational** (needs Rob) when it touches Layer 1/2: voice, product facts/lineup, hard rules (em dash, casing, structure), or the step framework. Marlow detects this and **cannot self-apply**.

Flow:

1. Alex asks for a foundational change. Marlow confirms it's base-level and drafts a proposed wording.
2. Marlow can **simulate** it (so Alex/Rob see the effect) but the result is **pending**, never live.
3. A `prompt_change_requests` doc is written `status: "open"` with Alex's intent, Marlow's proposed base-prompt edit, and the simulation sample (see §5.4).
4. Rob is notified (admin page badge + optional Discord). Rob **approves** (applies to base prompt / synthesized rules) or **declines** with a note.
5. Until Rob acts, the live base prompt is unchanged.

This is the hard gate: Alex can experiment freely in simulate mode, but **nothing foundational ships without Rob.**

## 5. Data model (Firestore)

Reuse the existing `prompt_config` pattern. Add a second tracked rule set so the overlay is independent of the synthesized rules.

### 5.1 `prompt_config/operator_overlay` (pointer)

```jsonc
{
  "active_version_id": "overlay_2026_06_heatwave",
  "scheduled": [
    { "version_id": "overlay_2026_12_gifting", "start": "2026-12-01", "end": "2026-12-24" },
    { "version_id": "overlay_2027_01_dryjan",  "start": "2027-01-01", "end": "2027-01-31" }
  ],
  "updated_at": "2026-06-12T10:00:00Z",
  "updated_by": "<alex_uid>"
}
```

### 5.2 `prompt_config/operator_overlay/versions/{version_id}`

```jsonc
{
  "version_id": "overlay_2026_06_heatwave",
  "label": "June heatwave — spritz push",
  "overlay_md": "- SEASONAL EMPHASIS (this week): heatwave in the UK. Lead with long, refreshing spritz serves...\n- EVENT BUZZ: Asterley Bros just entered a spirits contest — mention the excitement naturally where it fits, don't force it.",
  "created_by": "<alex_uid>",
  "created_at": "2026-06-12T10:00:00Z",
  "source": "prompt_coach",      // vs "manual"
  "chat_summary": "Alex asked for heatwave/spritz lean + contest buzz"
}
```

### 5.3 Runtime assembly

Extend `getPromptRules()` (or add `getOperatorOverlay()`) so `generateDrafts`, `regenerateDraft`, etc. build:

```js
const systemPrompt = EMAIL_SYSTEM_PROMPT
  + (promptRules ? `\n\nPROMPT RULES (apply to every email):\n${promptRules}` : "")
  + (overlay ? `\n\nOPERATOR NOTES (timely context — DO NOT override voice/format/product rules):\n${overlay}` : "");
```

Overlay resolution order: active scheduled overlay whose date range covers today → else `active_version_id` → else empty. Same 15-min cache TTL.

### 5.4 `prompt_change_requests/{id}` (escalation to Rob)

When Alex asks for something foundational, Marlow logs an approval request instead of acting:

```jsonc
{
  "requested_by": "<alex_uid>",
  "request": "Make tone more formal for hotel bars",
  "agent_reason": "Voice change — base prompt, admin sign-off required",
  "proposed_edit": "Add to TONE section: for hotel/restaurant bars, dial back slang...",
  "target_layer": "base",        // base | synthesized_rules
  "simulation_sample": { "lead_id": "...", "subject": "...", "body": "..." },
  "status": "open",              // open | approved | declined
  "decided_by": null,
  "decision_note": null,
  "created_at": "..."
}
```

Surfaced to Rob on the admin prompt page (badge) + optional Discord ping. Approve applies the edit; decline records a note.

## 6. Base prompt guard clause

Add to `EMAIL_SYSTEM_PROMPT` (Layer 1), so operator notes can never break hard rules:

> Operator notes appended below are timely context only (weather, events, seasonal emphasis). They may shift which products or serves you lead with and add topical flavour. They must NEVER override your voice, the no-em-dash rule, product name casing, or the email structure.

## 7. Permissions

Today roles are `admin` / `viewer` (`users.role`). Add an `operator` role (or grant overlay rights to a named set):

| Action | viewer | operator (Alex) | admin (Rob) |
|--------|:---:|:---:|:---:|
| View overlays | ✓ | ✓ | ✓ |
| Edit/activate operator overlay (Layer 3) | ✗ | ✓ | ✓ |
| Edit base prompt (Layer 1) | ✗ | ✗ | ✓ |
| Activate synthesized rules (Layer 2) | ✗ | ✗ | ✓ |

New callables, role-gated like existing ones (`functions/index.js:1545` pattern):

- `coachPromptChat({ message, draft_overlay_md? })` → runs Marlow (persona + Claude); returns reply + proposed overlay or a flagged foundational request. Requires `operator`+.
- `simulateDraft({ lead_id, overlay_md })` → real-lead dry-run sample, no persistence (§4.4). operator+.
- `setOperatorOverlay({ version_id })` / `saveOperatorOverlay({ label, overlay_md, schedule? })` → operator+.
- `createPromptChangeRequest({ ... })` → operator+ (writes `prompt_change_requests`).
- `decidePromptChangeRequest({ id, decision, note? })` → **admin only** (Rob approves/declines).
- `setActivePromptVersion` (existing) and any base-prompt editor → admin only, unchanged.

## 8. Frontend

New page `/settings/prompt-coach`:

- **Chat panel** — Alex talks to Marlow (calls `coachPromptChat`); persona-styled.
- **Active overlay card** — shows current `overlay_md`, who set it, when.
- **Versions list** — saved overlays, activate / schedule / revert (mirror the existing `prompt-rules/page.tsx` card layout).
- **Simulate panel** — pick a lead, run `simulateDraft`, show current-vs-proposed drafts side by side. No send, no write.

Admin-only `/settings/prompt-rules` stays as is for Layer 2; add a **Change requests** inbox reading `prompt_change_requests` (approve/decline via `decidePromptChangeRequest`).

## 9. Build phases

1. **Data + runtime** — add `prompt_config/operator_overlay` pointer + versions; extend prompt assembly with the overlay layer + base-prompt guard clause. Ship overlay-aware generation behind a manual write first.
2. **Callables + role** — add `operator` role; `setOperatorOverlay` / `saveOperatorOverlay`, scheduling resolution.
3. **Simulate mode** — `simulateDraft` callable reusing `buildPrompt` + `callDraftLLM`, no persistence; current-vs-proposed diff in UI.
4. **Marlow agent** — `COACH_PERSONA_PROMPT` + `coachPromptChat`; foundational-change detection → `prompt_change_requests`; `decidePromptChangeRequest` (admin).
5. **Frontend** — `/settings/prompt-coach` chat + simulate + versions; admin change-request inbox.

## 10. Verification

- Marlow responds in persona (Cellar Master voice), not generic assistant.
- Simulate mode renders a real draft from actual lead enrichment with the proposed overlay, writes nothing to `outreach_messages` / `generation_log`.
- Heatwave overlay applied → next `generateDrafts` email leans spritz; no em dashes, product casing intact (Layer 3 additive, Layer 1 enforced).
- Scheduled "Dry January" overlay activates only within its date range.
- Alex asks to "drop the casual tone" → Marlow flags foundational, writes `prompt_change_requests` (status `open`), base prompt unchanged until Rob decides; `decidePromptChangeRequest` is admin-only.
- Non-operator (`viewer`) call to `setOperatorOverlay` / `simulateDraft` → `permission-denied`.
