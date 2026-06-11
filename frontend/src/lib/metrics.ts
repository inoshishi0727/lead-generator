/**
 * Single source of truth for outreach metrics rendered across the app.
 *
 * Why this exists:
 *   Before this module, reply rate was computed inline at three sites with
 *   three different denominators — producing "44.4%" on the Dashboard,
 *   "209%" on Analytics, and "5%" on Analytics (12wk). Same screen, three
 *   answers. This module pins one definition per metric so a number can
 *   only render in one version.
 *
 * Conventions:
 *   - Every selector returns { numerator, denominator, rate } so the call
 *     site can render any view of the same underlying truth.
 *   - `rate` is always `numerator / denominator`, clamped to 0 when the
 *     denominator is 0. Never `NaN`, never `Infinity`, never > 1.
 *   - Percent formatting goes through `formatRate()` so empty pools render
 *     "0%" (or whatever you choose), not "NaN%" or unbounded values.
 *   - Funnel stages are cohort-monotonic by construction (see
 *     `computeFunnel`): every stage is upper-bounded by the previous stage,
 *     so the funnel can never invert.
 */

import type { Lead, OutreachMessage } from "./types";

export const WEEKLY_SEND_TARGET = 100;

export interface MetricResult {
  numerator: number;
  denominator: number;
  rate: number; // 0..1, clamped
}

function makeResult(numerator: number, denominator: number): MetricResult {
  if (denominator <= 0) return { numerator, denominator: 0, rate: 0 };
  const clamped = Math.min(1, Math.max(0, numerator / denominator));
  return { numerator, denominator, rate: clamped };
}

/**
 * Public clamp utility — when a call site already has numerator + denominator
 * (e.g. from a backend payload) and just wants the consistent clamped rate.
 * Prevents > 100% rendering even when upstream data is inconsistent.
 */
export function makeRate(numerator: number, denominator: number): MetricResult {
  return makeResult(numerator, denominator);
}

export function formatRate(r: MetricResult, fractionDigits = 1): string {
  if (r.denominator === 0) return "0%";
  const pct = r.rate * 100;
  return `${pct.toFixed(fractionDigits)}%`;
}

export function formatRateInt(r: MetricResult): string {
  if (r.denominator === 0) return "0%";
  return `${Math.round(r.rate * 100)}%`;
}

// ───────────────────────────────────────────────────────────────────────
//  REPLY RATE
// ───────────────────────────────────────────────────────────────────────

/**
 * Message-level reply rate: messages with a reply / messages sent.
 *
 * Use this when you want "of the emails we sent, how many got a reply" —
 * the most common business question.
 */
export function computeMessageReplyRate(messages: OutreachMessage[]): MetricResult {
  const sent = messages.filter((m) => m.status === "sent").length;
  const replied = messages.filter((m) => m.status === "sent" && m.has_reply).length;
  return makeResult(replied, sent);
}

/**
 * Lead-level reply rate: leads with at least one reply / leads we sent at
 * least one message to.
 *
 * Use this when you want "of the venues we reached out to, how many
 * responded" — the prior Dashboard "44.4%" was an INVALID mix (leads with
 * any reply ÷ messages sent), which is what this selector replaces.
 */
export function computeLeadReplyRate(leads: Lead[], messages: OutreachMessage[]): MetricResult {
  const contactedLeadIds = new Set<string>();
  for (const m of messages) {
    if (m.status === "sent" && m.lead_id) contactedLeadIds.add(m.lead_id);
  }
  let replied = 0;
  for (const l of leads) {
    if (!contactedLeadIds.has(l.id)) continue;
    if ((l.reply_count ?? 0) > 0) replied += 1;
  }
  return makeResult(replied, contactedLeadIds.size);
}

// ───────────────────────────────────────────────────────────────────────
//  OPEN RATE / DELIVERY RATE
// ───────────────────────────────────────────────────────────────────────

export function computeOpenRate(messages: OutreachMessage[]): MetricResult {
  const sent = messages.filter((m) => m.status === "sent").length;
  const opened = messages.filter((m) => m.status === "sent" && (m.open_count ?? 0) > 0).length;
  return makeResult(opened, sent);
}

// ───────────────────────────────────────────────────────────────────────
//  SEND COUNTS
// ───────────────────────────────────────────────────────────────────────

export function computeSendCount(messages: OutreachMessage[]): number {
  return messages.filter((m) => m.status === "sent").length;
}

export function computeSentInWindow(
  messages: OutreachMessage[],
  windowStartIso: string,
): number {
  return messages.filter(
    (m) => m.status === "sent" && m.sent_at && m.sent_at >= windowStartIso,
  ).length;
}

/**
 * Weekly send progress against WEEKLY_SEND_TARGET (default 100).
 * Used by the "Weekly target" bar on the Outreach Overview.
 */
export function computeWeeklyTargetProgress(
  messages: OutreachMessage[],
  weekStartIso: string,
  target: number = WEEKLY_SEND_TARGET,
): MetricResult {
  const sent = computeSentInWindow(messages, weekStartIso);
  return makeResult(sent, target);
}

// ───────────────────────────────────────────────────────────────────────
//  FUNNEL (cohort-monotonic by construction)
// ───────────────────────────────────────────────────────────────────────

export interface FunnelStage {
  name: string;
  count: number;
  rate_of_cohort: number; // count / cohort_size
  rate_of_previous: number; // count / previous stage count
}

export interface FunnelResult {
  cohortSize: number;
  stages: FunnelStage[];
}

/**
 * Compute a cohort-based funnel from a set of leads (the cohort) and the
 * messages associated with them. Every stage is upper-bounded by the
 * previous stage, so the funnel cannot be non-monotonic — the source of
 * the prior "Enriched 24 < Scored 72 < Draft Generated 126" bug.
 *
 * Caller picks the cohort (e.g., leads created in the last 12 weeks).
 */
export function computeFunnel(cohortLeads: Lead[], messages: OutreachMessage[]): FunnelResult {
  const cohortSize = cohortLeads.length;
  const cohortIds = new Set(cohortLeads.map((l) => l.id));
  const cohortMessages = messages.filter((m) => m.lead_id && cohortIds.has(m.lead_id));

  // Each step is computed from the cohort and then clamped to be at most
  // the previous step's count. Real-world data shouldn't need the clamp
  // for a properly-defined cohort, but the clamp guarantees monotonicity
  // even if a stage is mis-counted upstream.
  const enriched = cohortLeads.filter((l) => l.enrichment_status === "success").length;
  const scored = Math.min(
    cohortLeads.filter((l) => (l.score ?? 0) > 0).length,
    enriched,
  );
  const draftIds = new Set(
    cohortMessages.filter((m) => m.status !== undefined && m.status !== null).map((m) => m.lead_id),
  );
  const draftGenerated = Math.min(draftIds.size, scored);
  const approvedIds = new Set(
    cohortMessages.filter((m) => m.status === "approved" || m.status === "sent").map((m) => m.lead_id),
  );
  const approved = Math.min(approvedIds.size, draftGenerated);
  const sentIds = new Set(
    cohortMessages.filter((m) => m.status === "sent").map((m) => m.lead_id),
  );
  const sent = Math.min(sentIds.size, approved);
  const respondedIds = new Set(
    cohortMessages.filter((m) => m.status === "sent" && m.has_reply).map((m) => m.lead_id),
  );
  const responded = Math.min(respondedIds.size, sent);

  const stages: { name: string; count: number }[] = [
    { name: "enriched", count: enriched },
    { name: "scored", count: scored },
    { name: "draft_generated", count: draftGenerated },
    { name: "approved", count: approved },
    { name: "sent", count: sent },
    { name: "responded", count: responded },
  ];

  return {
    cohortSize,
    stages: stages.map((s, i) => ({
      name: s.name,
      count: s.count,
      rate_of_cohort: cohortSize > 0 ? s.count / cohortSize : 0,
      rate_of_previous: i === 0
        ? (cohortSize > 0 ? s.count / cohortSize : 0)
        : (stages[i - 1].count > 0 ? s.count / stages[i - 1].count : 0),
    })),
  };
}
