import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { ScrapeBatchStatus } from "./use-scrape-batch";

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
  const [batchId, setBatchId] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
  if (final === "completed" || final === "failed") {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  }

  return {
    start: (leadIds: string[]) => start.mutate(leadIds),
    isStarting: start.isPending,
    status: statusQuery.data ?? null,
    batchId,
    reset: () => setBatchId(null),
  };
}
