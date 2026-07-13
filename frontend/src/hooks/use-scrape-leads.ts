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

/** Shared mutation key so /scrapes can observe in-flight per-lead scrapes via
 *  TanStack Query's mutation cache (useMutationState). Lets the Live section
 *  show "Re-enriching {venue}…" while a lead-detail or leads-table button is
 *  doing its synchronous scrape. */
export const SCRAPE_LEAD_NOW_KEY = ["scrape-lead-now"] as const;

/**
 * Scrape + enrich a single existing lead in place. Synchronous (~45-120s).
 */
export function useScrapeLeadNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: SCRAPE_LEAD_NOW_KEY,
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

/** Per-lead async scrape jobs (leadId -> batchId), persisted so an in-flight
 *  single-lead re-enrich survives navigation/unmount, mirroring the batch hook. */
const NOW_JOBS_KEY = "scrape_now_async_jobs";

function loadNowJobs(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(NOW_JOBS_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function storeNowJobs(jobs: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(jobs).length) localStorage.setItem(NOW_JOBS_KEY, JSON.stringify(jobs));
    else localStorage.removeItem(NOW_JOBS_KEY);
  } catch {
    // Quota / privacy mode — degrade to "lose state on navigation".
  }
}

/**
 * Async single-lead scrape + enrich. Kicks off a background job (full 4-step
 * scrape-now pipeline) and polls the shared batch tracker, so it never hits the
 * Netlify ~26s gateway timeout the synchronous {@link useScrapeLeadNow} does.
 * Tracks multiple concurrent per-lead jobs (for the leads-table Zap buttons).
 */
export function useScrapeNowAsync() {
  const [jobs, setJobsState] = useState<Record<string, string>>(() => loadNowJobs());
  const queryClient = useQueryClient();

  const setJob = (leadId: string, batchId: string | null) => {
    setJobsState((prev) => {
      const next = { ...prev };
      if (batchId) next[leadId] = batchId;
      else delete next[leadId];
      storeNowJobs(next);
      return next;
    });
  };

  const start = useMutation({
    mutationFn: async (leadId: string): Promise<{ leadId: string; data: ScrapeBatchStatus }> => {
      const res = await fetch(`/api/leads/${leadId}/scrape-now-async`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as ScrapeBatchStatus | { error?: string };
      if (!res.ok || !("batch_id" in data)) {
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      return { leadId, data: data as ScrapeBatchStatus };
    },
    onSuccess: ({ leadId, data }) => {
      setJob(leadId, data.batch_id);
    },
    onError: (err: Error) => {
      toast.error("Scrape failed", { description: err.message });
    },
  });

  const activeBatchIds = Object.values(jobs);

  const statusQuery = useQuery({
    queryKey: ["scrape-now-async", activeBatchIds.sort().join(",")],
    queryFn: async (): Promise<Record<string, ScrapeBatchStatus>> => {
      const out: Record<string, ScrapeBatchStatus> = {};
      for (const [leadId, batchId] of Object.entries(jobs)) {
        const res = await fetch(`/api/scrape-batch/${batchId}`);
        if (res.status === 404) {
          setJob(leadId, null); // stale job id — stop polling it
          continue;
        }
        if (!res.ok) continue;
        out[leadId] = (await res.json()) as ScrapeBatchStatus;
      }
      return out;
    },
    enabled: activeBatchIds.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data as Record<string, ScrapeBatchStatus> | undefined;
      if (!data) return 2000;
      const anyActive = Object.values(data).some(
        (s) => s.status !== "completed" && s.status !== "failed",
      );
      return anyActive ? 2000 : false;
    },
  });

  // Clear finished jobs and refresh leads when any single scrape completes.
  useEffect(() => {
    const data = statusQuery.data;
    if (!data) return;
    let anyDone = false;
    for (const [leadId, s] of Object.entries(data)) {
      if (s.status === "completed" || s.status === "failed") {
        setJob(leadId, null);
        anyDone = true;
        const item = s.items?.[0];
        if (item?.status === "error" && item.error) {
          toast.error("Scrape failed", { description: item.error });
        } else if (item?.business_name) {
          toast.success(`Scraped: ${item.business_name}`);
        }
      }
    }
    if (anyDone) queryClient.invalidateQueries({ queryKey: ["leads"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQuery.data]);

  const statusFor = (leadId: string): ScrapeBatchStatus | null =>
    statusQuery.data?.[leadId] ?? null;

  return {
    start: (leadId: string) => start.mutate(leadId),
    isStarting: start.isPending,
    statusFor,
    /** True while a scrape for this lead is queued or running. */
    isRunning: (leadId: string): boolean => {
      const polled = statusQuery.data?.[leadId]?.status;
      const status = polled ?? (jobs[leadId] ? "pending" : undefined);
      return status === "pending" || status === "running";
    },
  };
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
