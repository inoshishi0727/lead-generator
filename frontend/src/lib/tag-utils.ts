/**
 * Tag normalization + near-match utilities.
 *
 * Operator-supplied tags get normalized to a canonical form before write/compare
 * so that "South London", "south_london", and "southlondon" all collapse to
 * "south-london". Smart-suggest then surfaces existing tags + Levenshtein-1
 * near-matches so we don't end up with three variants of the same campaign.
 */

/**
 * Normalize a raw tag input to canonical form.
 *
 *   normalizeTag("South London")     → "south-london"
 *   normalizeTag("south_london")     → "south-london"
 *   normalizeTag("  XMAS 2026!  ")   → "xmas-2026"
 *   normalizeTag("café-discount")    → "café-discount"   (unicode preserved)
 */
export function normalizeTag(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[_\s]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Classic dynamic-programming Levenshtein distance.
 * Used to surface near-match suggestions: "xmas-2026" ≈ "xmass-2026" (distance 1).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  const curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return curr[b.length];
}

/**
 * Given a raw input and a set of known canonical tags, return suggestions:
 *   - exact normalized match → returned alone
 *   - otherwise, ranked: prefix matches first (so "asterley-b" surfaces
 *     "asterley-bros"), then Levenshtein near-matches (≤ maxDistance) to catch
 *     typos. Prefix matches sorted shortest-first; near-matches by distance.
 */
export function suggestTags(
  input: string,
  known: Iterable<string>,
  maxDistance = 1,
): string[] {
  const norm = normalizeTag(input);
  if (!norm) return [];
  const knownArr = Array.from(known);
  if (knownArr.includes(norm)) return [norm];

  const prefix = knownArr
    .filter((tag) => tag !== norm && tag.startsWith(norm))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));

  const prefixSet = new Set(prefix);
  const near = knownArr
    .map((tag) => ({ tag, d: levenshtein(norm, tag) }))
    .filter((x) => x.d > 0 && x.d <= maxDistance && !prefixSet.has(x.tag))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.tag);

  return [...prefix, ...near];
}
