/**
 * The Python backend writes naive UTC timestamps (`datetime.now().isoformat()`,
 * no "Z" suffix). `new Date("2026-07-14T16:12:11")` parses a tz-less string as
 * LOCAL time, so relative times come out off by the viewer's UTC offset (e.g.
 * "8h ago" for something scraped a minute ago). Parse tz-less strings as UTC.
 */
export function toDate(iso: string): Date {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? new Date(iso) : new Date(iso + "Z");
}

/** Milliseconds since an ISO timestamp, treating tz-less strings as UTC. */
export function msSinceUtc(iso: string): number {
  return Date.now() - toDate(iso).getTime();
}

/** Compact "3m ago" / "2h ago" / "5d ago" label. Handles naive-UTC input. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = msSinceUtc(iso);
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
