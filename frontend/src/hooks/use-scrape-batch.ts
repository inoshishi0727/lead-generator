import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

export interface ScrapeBatchItem {
  input: string;
  status: "pending" | "running" | "added" | "duplicate" | "error" | string;
  business_name?: string | null;
  detected_kind?: string | null;
  lead_id?: string | null;
  error?: string | null;
  /** Live progress label while running, e.g. "fetching page", "enriching X". */
  step?: string | null;
}

export interface ScrapeBatchStatus {
  batch_id: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  total: number;
  completed: number;
  added: number;
  duplicate: number;
  failed: number;
  started_at: string;
  completed_at?: string | null;
  items: ScrapeBatchItem[];
}

/**
 * Mutation + polling for the bulk single-venue scrape.
 *
 * Workflow:
 *   const { start, status, batchId, reset } = useScrapeBatch();
 *   start(["url1", "name2", ...])  // kicks off, returns immediately
 *   // status auto-updates every 2s while running
 */
export function useScrapeBatch() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const start = useMutation({
    mutationFn: async (inputs: string[]): Promise<ScrapeBatchStatus> => {
      const res = await fetch("/api/scrape-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });
      const data = (await res.json().catch(() => ({}))) as ScrapeBatchStatus | { error?: string };
      if (!res.ok || !("batch_id" in data)) {
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      return data as ScrapeBatchStatus;
    },
    onSuccess: (data) => {
      setBatchId(data.batch_id);
      toast.success(`Queued ${data.total} venue${data.total === 1 ? "" : "s"}`);
    },
    onError: (err: Error) => {
      toast.error("Couldn't start bulk scrape", { description: err.message });
    },
  });

  const statusQuery = useQuery({
    queryKey: ["scrape-batch", batchId],
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

  // When the batch wraps, refresh the leads list.
  const finalStatus = statusQuery.data?.status;
  if (finalStatus === "completed" || finalStatus === "failed") {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  }

  return {
    start: (inputs: string[]) => start.mutate(inputs),
    isStarting: start.isPending,
    status: statusQuery.data ?? null,
    batchId,
    reset: () => setBatchId(null),
  };
}
