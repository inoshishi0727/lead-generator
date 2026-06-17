"use client";

/**
 * useTagIndex — live subscription to the canonical tag catalog.
 *
 * The `tag_index/counts` doc is maintained server-side and shaped as
 * `Record<string, number>` (canonical tag → usage count). Backend triggers
 * decrement counts toward zero on tag removal, so we filter to `count > 0`
 * before returning. Sorted by count desc with alphabetical tiebreak so the
 * most-used campaigns surface first in autocomplete.
 */

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";

interface UseTagIndexResult {
  tags: string[];
  loading: boolean;
  error: Error | null;
}

export function useTagIndex(): UseTagIndexResult {
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ref = doc(db, "tag_index", "counts");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setTags([]);
          setLoading(false);
          return;
        }
        const raw = snap.data() as Record<string, unknown>;
        const entries: Array<[string, number]> = [];
        for (const [tag, count] of Object.entries(raw)) {
          const n = typeof count === "number" ? count : Number(count);
          if (Number.isFinite(n) && n > 0) entries.push([tag, n]);
        }
        entries.sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          return a[0].localeCompare(b[0]);
        });
        setTags(entries.map(([tag]) => tag));
        setLoading(false);
      },
      (err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { tags, loading, error };
}
