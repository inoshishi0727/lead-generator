/**
 * Shared "is this thing stuck?" thresholds used by every surface that
 * reconciles stale state. One source of truth so the Dashboard, the scrape
 * banner, the leads table, and any future "needs attention" card all use the
 * same numbers.
 *
 * If you change a threshold, change it here only. The matching backend cron
 * (functions/index.js → reconcileExpiredCampaigns) hard-codes its own
 * threshold for campaign auto-complete; if you adjust CAMPAIGN_GRACE_DAYS,
 * mirror it there too.
 */

/** A scrape run that's been `status: "running"` for longer than this is
 *  treated as stalled (the operator can dismiss it or mark it failed). */
export const SCRAPE_STALE_MS = 4 * 60 * 60 * 1000; // 4 hours

/** A lead with `enrichment_status !== "success"` whose `created_at` is older
 *  than this many days surfaces as needing attention on the Dashboard. */
export const ENRICHMENT_STALE_DAYS = 7;

/** Days after `timeframe_end` before a campaign is considered overdue.
 *  Currently informational (the cron auto-completes campaigns immediately at
 *  timeframe_end), but the Campaigns page uses this for the "Past end date"
 *  pill. */
export const CAMPAIGN_GRACE_DAYS = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days since the given ISO timestamp (or null if the input is falsy). */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / MS_PER_DAY);
}

export function msSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Date.now() - then;
}

export interface StaleLeadCandidate {
  id: string;
  business_name?: string | null;
  enrichment_status?: string | null;
  created_at?: string | null;
  scraped_at?: string | null;
}

/** True when the lead is stuck in pre-enrichment past the threshold. */
export function isStaleEnrichment(lead: StaleLeadCandidate): boolean {
  if (lead.enrichment_status === "success") return false;
  const age = daysSince(lead.created_at ?? lead.scraped_at ?? null);
  return age !== null && age >= ENRICHMENT_STALE_DAYS;
}
