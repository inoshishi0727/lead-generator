/**
 * Single source of truth for "is this internal/test traffic, not a real
 * customer/lead". Used by:
 *   - Sommelier conversation list (frontend/src/lib/firestore-api.ts)
 *   - Sommelier export route (frontend/src/app/api/conversations/export)
 *   - Cost analytics route (frontend/src/app/api/analytics/cost)
 *   - Any future leads-side filter that wants to exclude audit-test@ traffic
 *
 * The patterns intentionally mirror the backfill script at
 * scripts/backfill-test-sessions.mjs — if you change a regex here, change it
 * there too. The script tags `isTest:true` on historical rows; this module
 * filters at read-time on both tagged rows and rows whose only test marker
 * is in a stored string field (e.g. the user's email typed mid-conversation).
 *
 * Contract for the sommelier widget (Shopify-side, separate repo):
 *   When the cookie `__as_internal=1` is present OR the customer email
 *   matches one of these patterns, set `isTest: true` on the new conversation
 *   doc. Until that widget PR lands, the read-time regex below is the only
 *   guard against the audit-test@ pollution.
 */

export const INTERNAL_EMAIL_PATTERNS: RegExp[] = [
  /audit-test/i,
  /^qa-/i,
  /^test\+/i,
  /@asterleybros\.com$/i,
];

/** Detect QA probe text in stored strings (e.g. <script>alert(1)</script>). */
export const PROBE_PATTERNS: RegExp[] = [
  /<script[^>]*>/i,
  /\balert\s*\(\s*1\s*\)/i,
  /\bonerror\s*=/i,
];

function matchAny(patterns: RegExp[], value: string | null | undefined): boolean {
  if (!value) return false;
  const s = String(value);
  return patterns.some((re) => re.test(s));
}

export interface InternalSessionDoc {
  isTest?: boolean;
  firstUserMessage?: string | null;
  userEmail?: string | null;
  email?: string | null;
  pageUrl?: string | null;
  tags?: string[];
}

/**
 * Returns true if the conversation doc looks like internal QA traffic. Fast
 * path checks the boolean tag + a handful of string fields; doesn't fetch the
 * messages subcollection (the backfill script handles that one-shot pass).
 */
export function isInternalSession(doc: InternalSessionDoc): boolean {
  if (doc.isTest === true) return true;
  if (Array.isArray(doc.tags) && doc.tags.includes("internal")) return true;
  if (matchAny(INTERNAL_EMAIL_PATTERNS, doc.firstUserMessage)) return true;
  if (matchAny(INTERNAL_EMAIL_PATTERNS, doc.userEmail)) return true;
  if (matchAny(INTERNAL_EMAIL_PATTERNS, doc.email)) return true;
  if (matchAny(PROBE_PATTERNS, doc.firstUserMessage)) return true;
  if (matchAny(PROBE_PATTERNS, doc.pageUrl)) return true;
  return false;
}

export interface InternalLeadDoc {
  email?: string | null;
  contact_email?: string | null;
  business_name?: string | null;
}

/**
 * Mirror predicate for the Leads side. Currently used by the W3.3 hygiene
 * work; a future Leads ticket can plug this into a "Hide internal" filter.
 */
export function isInternalLead(lead: InternalLeadDoc): boolean {
  if (matchAny(INTERNAL_EMAIL_PATTERNS, lead.email)) return true;
  if (matchAny(INTERNAL_EMAIL_PATTERNS, lead.contact_email)) return true;
  return false;
}
