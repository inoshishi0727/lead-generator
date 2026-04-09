import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vpsApi } from "@/lib/vps-api";
import type { ScrapeRequest, ScrapeStatus } from "@/lib/types";
import { useJobs } from "@/components/jobs-provider";
import { getActiveJobs } from "@/lib/job-store";
import { getScrapeRuns } from "@/lib/firestore-api";

export function useScrape() {
  const queryClient = useQueryClient();
  const { addJob } = useJobs();

  // Find any active scrape job from global store
  const activeScrapeJob = getActiveJobs().find((j) => j.type === "scrape");
  const activeRunId = activeScrapeJob?.id ?? null;

  const mutation = useMutation({
    mutationFn: (req: ScrapeRequest) =>
      vpsApi.post<ScrapeStatus>("/api/scrape", req),
    onSuccess: (data) => {
      addJob("scrape", data.run_id);
    },
  });

  const statusQuery = useQuery({
    queryKey: ["scrape-status", activeRunId],
    queryFn: async () => {
      try {
        return await vpsApi.get<ScrapeStatus>(`/api/scrape-status/${activeRunId}`);
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
