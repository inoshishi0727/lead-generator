import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/** Persist the in-flight bulk-enrichment run id so navigating away and back
 *  doesn't lose the "enriching X/N…" progress. Mirrors the scrape-url batch. */
export const ENRICH_RUN_KEY = "enrich_run_id";
/** Fired when a bulk enrichment kicks off, so the standalone panel picks it up. */
export const ENRICH_STARTED_EVENT = "enrich-run-started";

export interface EnrichItem {
  business_name?: string | null;
  lead_id?: string | null;
  status: "pending" | "enriching" | "success" | "failed" | "skipped" | string;
  error?: string | null;
}

export interface EnrichStatus {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  total: number;
  completed: number;
  current_lead?: string | null;
  enriched: number;
  failed: number;
  skipped: number;
  items: EnrichItem[];
}

export function loadEnrichRunId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ENRICH_RUN_KEY);
  } catch {
    return null;
  }
}

export function storeEnrichRunId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(ENRICH_RUN_KEY, id);
    else localStorage.removeItem(ENRICH_RUN_KEY);
  } catch {
    // quota / privacy mode — degrade to "lose progress on navigation"
  }
}

/**
 * Display-only tracker for the active bulk enrichment. Reads the run id from
 * localStorage on mount, listens for a new run starting, then polls the status
 * endpoint. Keeps the last result until superseded, so a standalone panel can
 * show progress independent of the button that triggered it.
 */
export function useActiveEnrich(): EnrichStatus | null {
  const [runId, setRunId] = useState<string | null>(() => loadEnrichRunId());

  useEffect(() => {
    const onStart = (e: Event) => {
      const id = (e as CustomEvent).detail?.runId as string | undefined;
      if (id) setRunId(id);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ENRICH_RUN_KEY) setRunId(e.newValue);
    };
    window.addEventListener(ENRICH_STARTED_EVENT, onStart);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ENRICH_STARTED_EVENT, onStart);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const query = useQuery({
    queryKey: ["active-enrich", runId],
    queryFn: async (): Promise<EnrichStatus | null> => {
      if (!runId) return null;
      const res = await fetch(`/api/enrich-status/${runId}`);
      if (!res.ok) return null; // 404 (expired) or transient — show nothing
      return (await res.json()) as EnrichStatus;
    },
    enabled: !!runId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (!s || s === "completed" || s === "failed") return false;
      return 2000;
    },
  });

  return query.data ?? null;
}
