import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { ScrapeBatchStatus } from "./use-scrape-batch";

/** Survives navigation away from the Dashboard / lead detail / wherever the
 *  hook was first invoked. Without this, the StaleLeadsCard loses the
 *  batchId on unmount and the "Re-enriching: N / total" indicator
 *  disappears even though the backend job is still running. Stored in
 *  localStorage and read back on mount. Cleared when the batch reaches a
 *  terminal status (completed / failed). */
const BATCH_STORAGE_KEY = "scrape_selected_batch_id";

function loadStoredBatchId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(BATCH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeBatchId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(BATCH_STORAGE_KEY, id);
    else localStorage.removeItem(BATCH_STORAGE_KEY);
  } catch {
    // Quota / privacy mode — ignore. Behaviour degrades to "lose state on
    // navigation", which is the original bug.
  }
}

/**
 * Scrape + enrich a single existing lead in place. Synchronous (~45-120s).
 */
export function useScrapeLeadNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      const res = await fetch(`/api/leads/${leadId}/scrape-now`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    },
    onSuccess: (data) => {
      const bits: string[] = [];
      if (data.address) bits.push(data.address);
      if (data.venue_category) bits.push(String(data.venue_category).replace(/_/g, " "));
      if (typeof data.score === "number") bits.push(`score ${data.score}`);
      toast.success(`Scraped: ${data.business_name}`, {
        description: bits.length ? bits.join(" · ") : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: Error) => {
      toast.error("Scrape failed", { description: err.message });
    },
  });
}

/**
 * Bulk scrape selected existing leads. Returns a batch_id + polling.
 */
export function useScrapeSelectedLeads() {
  // Rehydrate batchId from localStorage on first mount so navigating away
  // and coming back doesn't lose track of an in-flight scrape.
  const [batchId, setBatchIdState] = useState<string | null>(() => loadStoredBatchId());
  const queryClient = useQueryClient();

  // Wrapper so every batchId mutation also writes through to localStorage.
  const setBatchId = (next: string | null) => {
    setBatchIdState(next);
    storeBatchId(next);
  };

  const start = useMutation({
    mutationFn: async (leadIds: string[]): Promise<ScrapeBatchStatus> => {
      const res = await fetch("/api/leads/scrape-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: leadIds }),
      });
      const data = (await res.json().catch(() => ({}))) as ScrapeBatchStatus | { error?: string };
      if (!res.ok || !("batch_id" in data)) {
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      return data as ScrapeBatchStatus;
    },
    onSuccess: (data) => {
      setBatchId(data.batch_id);
      toast.success(`Scraping ${data.total} lead${data.total === 1 ? "" : "s"}`);
    },
    onError: (err: Error) => {
      toast.error("Couldn't start bulk scrape", { description: err.message });
    },
  });

  const statusQuery = useQuery({
    queryKey: ["scrape-leads-batch", batchId],
    queryFn: async (): Promise<ScrapeBatchStatus | null> => {
      if (!batchId) return null;
      const res = await fetch(`/api/scrape-batch/${batchId}`);
      // 404 from the batch endpoint means the stored batchId is stale (job
      // expired or backend forgot). Clear it so we stop polling on every
      // page load forever.
      if (res.status === 404) {
        setBatchId(null);
        return null;
      }
      if (!res.ok) return null;
      return (await res.json()) as ScrapeBatchStatus;
    },
    enabled: !!batchId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (!s || s === "completed" || s === "failed") return false;
      return 2000;
    },
  });

  const final = statusQuery.data?.status;

  // When the batch reaches a terminal state, invalidate leads (so updated
  // enrichment shows up) and clear the stored batchId — otherwise the next
  // page load would re-fetch a stale "completed" status forever.
  useEffect(() => {
    if (final === "completed" || final === "failed") {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      storeBatchId(null);
    }
  }, [final, queryClient]);

  return {
    start: (leadIds: string[]) => start.mutate(leadIds),
    isStarting: start.isPending,
    status: statusQuery.data ?? null,
    batchId,
    reset: () => setBatchId(null),
  };
}
