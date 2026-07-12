import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ScrapeBatchStatus } from "./use-scrape-batch";

/** Persist the in-flight URL-ingest batch id so a page navigation doesn't lose
 *  the "extracting N venues…" progress. Mirrors useScrapeSelectedLeads. */
const URL_BATCH_KEY = "scrape_url_batch_id";

function loadBatchId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(URL_BATCH_KEY);
  } catch {
    return null;
  }
}

function storeBatchId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(URL_BATCH_KEY, id);
    else localStorage.removeItem(URL_BATCH_KEY);
  } catch {
    // Quota / privacy mode — degrade to "lose progress on navigation".
  }
}

/**
 * Universal URL ingest: POST a URL (blog / listicle / venue) to the VPS, which
 * fetches the page, extracts every venue via Gemini, and enriches each into a
 * lead as a background job. Returns a batch_id + polling, so it never blocks on
 * the Netlify gateway. Poll surfaces per-venue progress.
 */
export function useScrapeUrl() {
  const [batchId, setBatchIdState] = useState<string | null>(() => loadBatchId());
  const queryClient = useQueryClient();

  const setBatchId = (next: string | null) => {
    setBatchIdState(next);
    storeBatchId(next);
  };

  const startMutation = useMutation({
    mutationFn: async (url: string): Promise<ScrapeBatchStatus> => {
      const res = await fetch("/api/scrape-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: url }),
      });
      const data = (await res.json().catch(() => ({}))) as ScrapeBatchStatus | { error?: string };
      if (!res.ok || !("batch_id" in data)) {
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      return data as ScrapeBatchStatus;
    },
    onSuccess: (data) => {
      setBatchId(data.batch_id);
      toast.success("Reading page & extracting venues…");
    },
    onError: (err: Error) => {
      toast.error("Couldn't start URL scrape", { description: err.message });
    },
  });

  const statusQuery = useQuery({
    queryKey: ["scrape-url-batch", batchId],
    queryFn: async (): Promise<ScrapeBatchStatus | null> => {
      if (!batchId) return null;
      const res = await fetch(`/api/scrape-batch/${batchId}`);
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

  useEffect(() => {
    if (final === "completed" || final === "failed") {
      const s = statusQuery.data;
      if (s) {
        const added = s.added ?? 0;
        if (added > 0) toast.success(`Added ${added} lead${added === 1 ? "" : "s"} from that page`);
        else if (s.status === "failed" || (s.items?.[0]?.status === "error"))
          toast.error("Nothing added", { description: s.items?.[0]?.error || "No venues enriched." });
      }
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      storeBatchId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [final]);

  return {
    start: (url: string) => startMutation.mutate(url),
    isStarting: startMutation.isPending,
    status: statusQuery.data ?? null,
    batchId,
    reset: () => setBatchId(null),
  };
}
