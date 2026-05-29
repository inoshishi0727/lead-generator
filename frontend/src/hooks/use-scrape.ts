import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { vpsApi } from "@/lib/vps-api";
import type { ScrapeRequest, ScrapeStatus } from "@/lib/types";
import { useJobs } from "@/components/jobs-provider";
import { getActiveJobs } from "@/lib/job-store";
import { getScrapeRuns, watchLatestScrapeRun, watchPipelineActivity, type ScrapeRunRecord, type PipelineJobRecord } from "@/lib/firestore-api";

const STALE_POLL_THRESHOLD_MS = 30_000;

export function useScrape() {
  const queryClient = useQueryClient();
  const { addJob } = useJobs();

  // Find any active scrape job from global store
  const activeScrapeJob = getActiveJobs().find((j) => j.type === "scrape");
  const activeRunId = activeScrapeJob?.id ?? null;

  const mutation = useMutation({
    mutationFn: async (req: ScrapeRequest) => {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
      return res.json() as Promise<ScrapeStatus>;
    },
    onSuccess: (data) => {
      addJob("scrape", data.run_id);
      toast.success("Scrape started", { description: `Run ID: ${data.run_id}` });
    },
    onError: (err: Error) => {
      const msg = err.message || "Unknown error";
      const isVpsDown = /VPS not configured|fetch|Failed to fetch|503/i.test(msg);
      toast.error(
        isVpsDown ? "Can't reach the scraping server" : "Couldn't start scrape",
        {
          description: isVpsDown
            ? "The VPS appears to be unreachable. Check it's running, or trigger via GitHub Actions instead."
            : msg,
        }
      );
    },
  });

  // Track when we last got a fresh status response so we can detect a stalled poller.
  const lastSuccessAtRef = useRef<number | null>(null);
  const staleToastShownRef = useRef(false);

  const statusQuery = useQuery({
    queryKey: ["scrape-status", activeRunId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/scrape-status?run_id=${activeRunId}`);
        if (!res.ok) return null;
        const data = (await res.json()) as ScrapeStatus;
        lastSuccessAtRef.current = Date.now();
        if (staleToastShownRef.current) {
          toast.success("Reconnected to scraping server");
          staleToastShownRef.current = false;
        }
        return data;
      } catch {
        return null;
      }
    },
    enabled: !!activeRunId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "completed" || status === "failed") return false;
      return 2000;
    },
  });

  // Watchdog: if an active scrape's polling has gone quiet for >30s, warn once.
  useEffect(() => {
    if (!activeRunId) return;
    const status = statusQuery.data?.status;
    if (status === "completed" || status === "failed") return;

    const interval = setInterval(() => {
      const last = lastSuccessAtRef.current;
      if (!last) return;
      const stale = Date.now() - last > STALE_POLL_THRESHOLD_MS;
      if (stale && !staleToastShownRef.current) {
        staleToastShownRef.current = true;
        toast.warning("Lost contact with scraping server", {
          description: "No progress updates for 30s. The scrape may still be running — check the History card or VPS logs.",
          duration: 10_000,
        });
      }
    }, 5_000);

    return () => clearInterval(interval);
  }, [activeRunId, statusQuery.data?.status]);

  // Invalidate leads when scrape completes
  const status = statusQuery.data?.status;
  if (status === "completed" || status === "failed") {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  }

  return {
    startScrape: mutation.mutate,
    isStarting: mutation.isPending,
    status: statusQuery.data ?? null,
    activeRunId,
  };
}

export function useScrapeHistory() {
  return useQuery({
    queryKey: ["scrape-runs"],
    queryFn: () => getScrapeRuns(10),
    refetchInterval: 60_000,
  });
}

/** Live Firestore listener for the most recent scrape run (manual or scheduled via GitHub Actions). */
export function useLiveScrapeRun() {
  const [run, setRun] = useState<ScrapeRunRecord | null>(null);
  useEffect(() => {
    const unsub = watchLatestScrapeRun(setRun);
    return unsub;
  }, []);
  return run;
}

/** Live Firestore listener for recent pipeline job activity (scheduled Cloud Functions). */
export function usePipelineActivity() {
  const [jobs, setJobs] = useState<PipelineJobRecord[]>([]);
  useEffect(() => {
    const unsub = watchPipelineActivity(setJobs, 10);
    return unsub;
  }, []);
  return jobs;
}
