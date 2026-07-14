import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ScrapeBatchStatus } from "./use-scrape-batch";
import { URL_BATCH_KEY, SCRAPE_URL_STARTED_EVENT, loadBatchId } from "./use-scrape-url";

/**
 * Display-only tracker for the active URL scrape. Reads the batch id from
 * localStorage on mount, listens for a new scrape starting, then polls the batch
 * endpoint. Lets a standalone live panel show progress independent of the paste
 * box. Keeps the last result until it's superseded by a new scrape.
 */
export function useActiveScrapeUrl(): ScrapeBatchStatus | null {
  const [batchId, setBatchId] = useState<string | null>(() => loadBatchId());

  useEffect(() => {
    const onStart = (e: Event) => {
      const id = (e as CustomEvent).detail?.batchId as string | undefined;
      if (id) setBatchId(id);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === URL_BATCH_KEY) setBatchId(e.newValue);
    };
    window.addEventListener(SCRAPE_URL_STARTED_EVENT, onStart);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SCRAPE_URL_STARTED_EVENT, onStart);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const query = useQuery({
    queryKey: ["active-scrape-url", batchId],
    queryFn: async (): Promise<ScrapeBatchStatus | null> => {
      if (!batchId) return null;
      const res = await fetch(`/api/scrape-batch/${batchId}`);
      if (!res.ok) return null; // 404 (expired) or transient — just show nothing
      return (await res.json()) as ScrapeBatchStatus;
    },
    enabled: !!batchId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (!s || s === "completed" || s === "failed") return false;
      return 1500;
    },
  });

  return query.data ?? null;
}
