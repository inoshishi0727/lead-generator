import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { vpsApi } from "@/lib/vps-api";
import type { ScrapeRequest, ScrapeStatus } from "@/lib/types";
import { useJobs } from "@/components/jobs-provider";
import { getActiveJobs } from "@/lib/job-store";
import { getScrapeRuns, watchLatestScrapeRun, watchPipelineActivity, type ScrapeRunRecord, type PipelineJobRecord } from "@/lib/firestore-api";

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
    },
  });

  const statusQuery = useQuery({
    queryKey: ["scrape-status", activeRunId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/scrape-status?run_id=${activeRunId}`);
        if (!res.ok) return null;
        return res.json() as Promise<ScrapeStatus>;
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
