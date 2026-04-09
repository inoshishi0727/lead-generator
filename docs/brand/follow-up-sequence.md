# SDR Follow-Up Sequence Design

## Date: 8 March 2026

## Research Summary

Based on 2025-2026 B2B cold email benchmarks:

- **First follow-up boosts replies by ~49%.** This is the single most valuable email in the sequence.
- **4-step sequences (1 first-touch + 3 follow-ups) are optimal.** Campaigns with 4+ emails can double or triple response rates vs single-email outreach.
- **Diminishing returns after step 3.** The third follow-up's effectiveness drops ~30% compared to the first follow-up.
- **Timing:** 3-4 business days between step 1 and 2. Then 5-7 days between steps 2-3. Then 7-10 days before the final "soft close."
- **Best send days:** Tuesday, Wednesday, Thursday. Best time: 10am-1pm.
- **Same thread vs new thread:** Follow-ups 1-2 should stay in the same thread (shows persistence without being annoying). The final email can break the thread with a fresh subject if the original was never opened.
- **Subject lines:** Avoid "Just following up" or "Checking in." Each follow-up should add new value.
- **The breakup email:** A respectful soft close that opens the door for future contact. Not desperate or guilt-tripping.

Sources:
- [Instantly Cold Email Benchmark Report 2026](https://instantly.ai/cold-email-benchmark-report-2026)
- [SalesCaptain: Cold Email Follow-Up](https://www.salescaptain.io/blog/cold-email-follow-up)
- [HyperGen: 10 Best Cold Email Strategies for 2026](https://www.hypergen.io/blog/the-10-best-cold-email-strategies-that-actually-get-responses)
- [Martal: B2B Cold Email Statistics 2025](https://martal.ca/b2b-cold-email-statistics-lb/)

---

## Sequence Structure: 4 Steps

| Step | Name | Timing | Thread | Purpose |
|------|------|--------|--------|---------|
| 1 | **First touch** | Day 0 | New thread | Introduce who we are, soft CTA, plant the seed |
| 2 | **Follow-up 1: Add value** | Day 3-4 | Same thread | Add a new angle or specific serve suggestion. Show we're thinking about them specifically. |
| 3 | **Follow-up 2: Social proof or seasonal nudge** | Day 10-12 | Same thread | Share a proof point, a seasonal angle, or a specific reason to act now |
| 4 | **Follow-up 3: Soft close** | Day 20-21 | Same thread (or new thread if original was never opened) | Respectful close. Leave the door open. No guilt. |

### Decision logic between steps

```
Step 1 sent
  ├─ Reply received → EXIT sequence, classify reply, route to human
  ├─ Opened but no reply → Step 2 (same thread, 3-4 days later)
  ├─ Not opened → Step 2 (same thread, 4 days later)
  │
Step 2 sent
  ├─ Reply received → EXIT sequence
  ├─ Opened but no reply → Step 3 (same thread, 7 days later)
  ├─ Not opened → Step 3 (same thread, 7 days later)
  │
Step 3 sent
  ├─ Reply received → EXIT sequence
  ├─ Opened (any step) but no reply → Step 4 (same thread, 10 days later)
  ├─ Never opened any email → Step 4 (NEW thread + new subject, 10 days later)
  │
Step 4 sent
  ├─ Reply received → EXIT sequence
  ├─ No reply → EXIT sequence. Mark prospect as "sequence_complete"
  │                             Add to re-engagement pool (contactable again in 90 days)
```

### The "never opened" fork

If no email in the sequence has ever been opened, the final email breaks the thread with a completely new subject line. This is because:

1. The original subject line clearly didn't work
2. A fresh thread gets a fresh chance in the inbox
3. It avoids the "Re: Re: Re:" pile-up that screams "ignored sales email"

---

## Full Example: Franco Manca (Restaurant Group)

Using the refined email structure from today's session.

### Step 1: First Touch (Day 0)

> **Subject:** British Spritz for the menu?
>
> Hi team,
>
> We're Asterley Bros, makers of English Vermouth and Amaro based in SE26. We love what you do, and I think a British Aperitivo Spritz on the menu alongside the Aperol would give your customers something genuinely different to try.
>
> Can we send some samples?
>
> Our ASTERLEY ORIGINAL is a British Aperitivo made with bitter orange, rhubarb, and rose. It makes a gorgeous Spritz: quick to pour, beautiful colour, and customers always ask about it. "British twist on an Italian classic" is a great menu story.
>
> You're clearly already doing aperitivo brilliantly across all your sites. I just think we'd be a really natural addition, especially with Spring here and Spritz season kicking off.
>
> We supply in 5L Bag in Box too, which keeps costs down and reduces waste across multiple sites. We're on Speciality Drinks, Venus, and several other wholesalers.
>
> Would love to arrange a tasting with your buying team. What's the best way to set that up?
>
> Cheers,
>
> Rob
> Asterley Bros
> asterleybros.com

**Word count:** 161
**Products:** ASTERLEY ORIGINAL
**CTA:** "Can we send some samples?" (early) + "What's the best way to set that up?" (close)

---

### Step 2: Follow-Up 1 — Add Value (Day 3-4)

**Strategy:** Same thread. Introduce a second product and a specific serve they could use. Short, new information only. Don't repeat the intro.

> **Subject:** Re: British Spritz for the menu?
>
> Hi team,
>
> Just a quick follow-up. One thing I didn't mention: alongside the Spritz, our DISPENSE Amaro makes a really interesting Negroni for the menu too. 24 botanicals, Pinot Noir base, and a couple of your competitors are already using it as their house Negroni. Customers notice the difference.
>
> Spritz + Negroni from one British producer. Two easy serves, one good story.
>
> Happy to send samples of both. Let me know and I'll get them to you this week.
>
> Cheers,
>
> Rob
> Asterley Bros
> asterleybros.com

**Word count:** 89
**Products:** DISPENSE (new), ASTERLEY ORIGINAL (implied from thread)
**What's different:** Shorter. Adds new value (second product, competitive proof). Doesn't re-introduce who we are. Simple CTA.

---

### Step 3: Follow-Up 2 — Seasonal Nudge + Social Proof (Day 10-12)

**Strategy:** Same thread. Use seasonality or a time-sensitive reason to act. If we have any specific social proof (another restaurant group, a review, an award), use it here. Keep it brief.

> **Subject:** Re: British Spritz for the menu?
>
> Hi team,
>
> Spring menus are being finalised across London right now and Spritz is the serve of the moment. Our ASTERLEY ORIGINAL has been picked up by several independent restaurants this season as a premium British alternative to Aperol. The "what's this one?" conversation it starts is exactly the kind of thing that builds loyalty.
>
> We also supply in 5L Bag in Box, which is substantially cheaper per litre and about 90% less packaging waste. Worth knowing about if Spritz is going through volume across your sites.
>
> Offer is always open: happy to send samples whenever works for you.
>
> Cheers,
>
> Rob
> Asterley Bros
> asterleybros.com

**Word count:** 108
**Products:** ASTERLEY ORIGINAL (reinforced), BiB (practical selling point for multi-site)
**What's different:** Time-sensitive angle (Spring menus being finalised). Social proof (other restaurants picking it up). Practical value (BiB cost/waste). No hard sell. CTA is soft: "whenever works for you."

---

### Step 4: Soft Close (Day 20-21)

**Strategy:** If they opened any previous email → same thread. If they never opened anything → new thread with fresh subject.

**Version A: Same thread (they opened at least one email)**

> **Subject:** Re: British Spritz for the menu?
>
> Hi team,
>
> Totally understand if the timing isn't right. Menu decisions are busy and we know there's a lot going on.
>
> I'll leave it with you. If you'd ever like to try our Aperitivo or Amaro, just reply to this email and I'll get samples sent straight over. No pressure at all.
>
> Have a great week.
>
> Cheers,
>
> Rob
> Asterley Bros
> asterleybros.com

**Word count:** 62
**What's different:** Very short. Respectful. No new product info. No flattery. Just a simple door left open. "Reply to this email" is the lowest-friction CTA possible.

**Version B: New thread (they never opened any email)**

> **Subject:** Quick one from Asterley Bros
>
> Hi team,
>
> I'm Rob from Asterley Bros. We make English Vermouth and Amaro in London and I think our products would be a great fit for Franco Manca's drinks menu.
>
> Our ASTERLEY ORIGINAL makes a gorgeous British Spritz and our DISPENSE makes a Negroni with real character. Both are quick, easy serves and we supply in Bag in Box for multi-site efficiency.
>
> Happy to send samples if you'd like to try them. Just let me know.
>
> Cheers,
>
> Rob
> Asterley Bros
> asterleybros.com

**Word count:** 88
**What's different:** Completely fresh start. New subject line. Brief re-introduction since they haven't engaged with any previous email. No reference to previous emails (avoids "you didn't reply" energy). Clean, simple, worth one more shot.

---

## Sequence Metrics to Track

| Metric | Source | Purpose |
|--------|--------|---------|
| **Open rate by step** | emails WHERE opened_at IS NOT NULL, grouped by sequence_step | Do later emails get opened? If step 3 open rate drops below 10%, consider shortening to 3 steps. |
| **Reply rate by step** | emails WHERE replied_at IS NOT NULL, grouped by sequence_step | Which step generates the most replies? Optimise that step's content. |
| **Step at conversion** | interactions WHERE type = order, JOIN emails ON prospect_id, MIN(sequence_step) | Which email step ultimately led to a sale? |
| **Never-opened rate** | Prospects where NO email in the sequence was ever opened | If high: subject lines or deliverability need work. Or targeting is wrong (bad email addresses). |
| **Thread break effectiveness** | Compare step 4 open rate for same-thread vs new-thread versions | Does the fresh subject line trick actually work? Data will tell us. |
| **Sequence completion rate** | Prospects who reached step 4 with no reply / total prospects entered | What % of prospects exhaust the full sequence? Should be 60-70%. Much higher means step 1 isn't working. |
| **Re-engagement success rate** | Prospects from re-engagement pool (90 days later) who eventually reply | Is it worth re-contacting completed sequences? |
| **Time to reply by step** | AVG hours between email sent_at and replied_at, by step | How quickly do people respond at each stage? |

---

## Rules for the AI When Generating Follow-Ups

1. **Never repeat the introduction.** Steps 2-3 should not re-introduce who we are or what we make. The thread provides that context. Exception: Step 4 Version B (new thread) gets a brief re-intro.

2. **Each follow-up must add new value.** A second product, a specific serve, a seasonal angle, social proof, a practical benefit (BiB, wholesaler availability). Never just "checking in."

3. **Get shorter with each step.** Step 1: 130-160 words. Step 2: 80-100 words. Step 3: 80-110 words. Step 4: 50-90 words.

4. **Tone stays consistent but softens.** Step 1 is warm and confident. Step 2 is helpful. Step 3 is informative. Step 4 is gracious.

5. **Never guilt-trip.** No "I haven't heard back" or "I'm sure you're busy" or "This is my last email." Just add value or leave the door open.

6. **Subject line strategy:**
   - Step 1: Fresh, specific, intriguing
   - Steps 2-3: "Re: [original subject]" (same thread)
   - Step 4: Same thread if they opened something. New subject if they never opened anything.

7. **CTA progression:**
   - Step 1: "Can we send samples?" + "What's the best way to set that up?"
   - Step 2: "Happy to send samples of both. Let me know."
   - Step 3: "Offer is always open. Happy to send samples whenever works."
   - Step 4: "Just reply to this email and I'll get samples sent." / "Just let me know."

8. **Product progression:**
   - Step 1: Lead product (the one most relevant to this venue)
   - Step 2: Second product (adds breadth, shows range)
   - Step 3: Reinforce lead product with seasonal/social proof angle
   - Step 4: Brief mention only, no new products

---

## Database and Schema Additions

### Changes to `emails` table

Add:

| Column | Type | Notes |
|--------|------|-------|
| `thread_id` | UUID | Groups emails in the same thread. All emails in a sequence share this unless a thread break occurs. |
| `is_thread_break` | BOOLEAN | TRUE if this email starts a new thread (step 4 Version B). Default FALSE. |
| `scheduled_send_at` | TIMESTAMP | When this email is scheduled to be sent. Calculated from previous step's sent_at + days_between_steps. |
| `send_window_start` | TIME | Earliest time of day to send (default 10:00). |
| `send_window_end` | TIME | Latest time of day to send (default 13:00). |
| `send_day_preference` | TEXT[] | Preferred days: ['tuesday', 'wednesday', 'thursday']. |

### Changes to `campaigns` table

Replace the single `days_between_steps` with a more flexible structure:

| Column | Type | Notes |
|--------|------|-------|
| `sequence_config` | JSONB | Replaces `sequence_steps` and `days_between_steps`. See structure below. |

**`sequence_config` JSONB structure:**

```json
{
  "steps": [
    {
      "step": 1,
      "name": "first_touch",
      "days_after_previous": 0,
      "auto_send": false,
      "requires_approval": true,
      "content_strategy": "introduce_lead_product",
      "target_word_count": [130, 160]
    },
    {
      "step": 2,
      "name": "add_value",
      "days_after_previous": 4,
      "auto_send": false,
      "requires_approval": true,
      "content_strategy": "second_product_or_serve",
      "target_word_count": [80, 100]
    },
    {
      "step": 3,
      "name": "seasonal_proof",
      "days_after_previous": 7,
      "auto_send": true,
      "requires_approval": false,
      "content_strategy": "social_proof_or_seasonal",
      "target_word_count": [80, 110]
    },
    {
      "step": 4,
      "name": "soft_close",
      "days_after_previous": 10,
      "auto_send": true,
      "requires_approval": false,
      "content_strategy": "gracious_close",
      "thread_break_if_never_opened": true,
      "target_word_count": [50, 90]
    }
  ],
  "re_engagement_cooldown_days": 90,
  "send_window": {
    "days": ["tuesday", "wednesday", "thursday"],
    "start_time": "10:00",
    "end_time": "13:00"
  }
}
```

### New table: `sequence_events`

Tracks the progression of each prospect through a sequence. One row per state change.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID, PK | |
| `prospect_id` | UUID, FK → prospects | |
| `campaign_id` | UUID, FK → campaigns | |
| `event_type` | TEXT | step_scheduled, step_sent, reply_received, sequence_completed, sequence_paused, re_engagement_eligible, thread_break |
| `sequence_step` | INT | Which step this event relates to |
| `email_id` | UUID, FK → emails | NULL for non-email events |
| `metadata` | JSONB | Additional context: { "reason": "never_opened", "thread_break": true } |
| `created_at` | TIMESTAMP | |

### Changes to `prospects` table

Add:

| Column | Type | Notes |
|--------|------|-------|
| `sequence_status` | TEXT | not_started, in_sequence, sequence_complete, re_engagement_eligible, re_engaged, converted, opted_out |
| `sequence_completed_at` | TIMESTAMP | When the full sequence finished (no reply) |
| `re_engagement_eligible_at` | TIMESTAMP | sequence_completed_at + 90 days. When they can be contacted again. |
| `times_sequenced` | INT | Default 0. How many times this prospect has gone through a full sequence. Cap at 2 to avoid spam. |

### New reporting metrics (add to `platform_review_snapshots`)

| Column | Type | Notes |
|--------|------|-------|
| `step1_open_rate` | DECIMAL | |
| `step2_open_rate` | DECIMAL | |
| `step3_open_rate` | DECIMAL | |
| `step4_open_rate` | DECIMAL | |
| `step1_reply_rate` | DECIMAL | |
| `step2_reply_rate` | DECIMAL | |
| `step3_reply_rate` | DECIMAL | |
| `step4_reply_rate` | DECIMAL | |
| `sequence_completion_rate` | DECIMAL | % of prospects who exhaust all 4 steps |
| `never_opened_rate` | DECIMAL | % where no email in sequence was opened |
| `thread_break_open_rate` | DECIMAL | Open rate for step 4 new-thread versions |
| `re_engagement_reply_rate` | DECIMAL | Reply rate for re-engaged prospects (Phase 2) |
| `avg_step_at_reply` | DECIMAL | Average sequence step at which replies come in |

### N8N Workflow Additions

| Trigger | Workflow | Action |
|---------|----------|--------|
| Email sent + days_after_previous elapsed + no reply | `generate_followup` | Generate next sequence step email. Check if thread break needed (never opened → Version B). Queue as draft or auto-send per campaign config. |
| All sequence steps exhausted, no reply | `mark_sequence_complete` | Update prospect.sequence_status to "sequence_complete". Set re_engagement_eligible_at. Log sequence_event. |
| Re-engagement date reached | `flag_re_engagement` | Update prospect.sequence_status to "re_engagement_eligible". Surface on dashboard for provider review. |
| Reply received at any step | `exit_sequence` | Cancel all scheduled follow-ups. Log sequence_event. Route reply to classification. |

### Dashboard Additions

**Client dashboard → Campaign page:**
- Sequence funnel visualisation: Step 1 → Step 2 → Step 3 → Step 4, showing drop-off and reply rates at each stage
- "In sequence" count: how many prospects are currently mid-sequence
- "Awaiting follow-up" count: emails due to be sent in the next 7 days

**Provider dashboard → Campaign drill-down:**
- Step-by-step performance breakdown per campaign
- Thread break effectiveness comparison
- Re-engagement pool size and upcoming eligible dates
- Sequence completion rate trend over time
