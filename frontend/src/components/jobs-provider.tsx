"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  type ActiveJob,
  type JobType,
  addJob as storeAddJob,
  getActiveJobs,
  getAllJobs,
  getStatusEndpoint,
  removeJob,
  updateJob,
} from "@/lib/job-store";

interface JobsContextValue {
  jobs: ActiveJob[];
  activeJobs: ActiveJob[];
  addJob: (type: JobType, id: string) => void;
  dismissJob: (id: string) => void;
}

const JobsContext = createContext<JobsContextValue>({
  jobs: [],
  activeJobs: [],
  addJob: () => {},
  dismissJob: () => {},
});

export function useJobs() {
  return useContext(JobsContext);
}

const POLL_INTERVAL = 2000;

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync state from localStorage
  const syncFromStorage = useCallback(() => {
    setJobs(getAllJobs());
  }, []);

  // Add a new job
  const handleAddJob = useCallback(
    (type: JobType, id: string) => {
      storeAddJob(type, id);
      syncFromStorage();
    },
    [syncFromStorage]
  );

  // Dismiss a job (remove from store)
  const handleDismiss = useCallback(
    (id: string) => {
      removeJob(id);
      syncFromStorage();
    },
    [syncFromStorage]
  );

  // Poll active jobs
  useEffect(() => {
    syncFromStorage();

    async function pollJobs() {
      const active = getActiveJobs();
      if (active.length === 0) return;

      for (const job of active) {
        try {
          const endpoint = getStatusEndpoint(job);
          const data = await api.get<Record<string, unknown>>(endpoint);
          const status = data.status as string;

          const isTerminal = status === "completed" || status === "failed";
          updateJob(job.id, {
            status: status as ActiveJob["status"],
            progress: (data.progress as number) ?? undefined,
            phase: (data.phase as string) ?? undefined,
          });

          if (isTerminal) {
            // Invalidate relevant queries
            if (job.type === "scrape") {
              queryClient.invalidateQueries({ queryKey: ["leads"] });
            } else if (job.type === "generate") {
              queryClient.invalidateQueries({ queryKey: ["outreach"] });
            } else if (job.type === "enrich") {
              queryClient.invalidateQueries({ queryKey: ["leads"] });
            }

            // Auto-remove after 5 seconds
            setTimeout(() => {
              removeJob(job.id);
              syncFromStorage();
            }, 5000);
          }
        } catch {
          // Server may have restarted — remove stale job
          removeJob(job.id);
        }
      }
      syncFromStorage();
    }

    pollJobs();
    pollRef.current = setInterval(pollJobs, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [syncFromStorage, queryClient]);

  const activeJobs = jobs.filter(
    (j) => j.status === "pending" || j.status === "running"
  );

  return (
    <JobsContext value={{ jobs, activeJobs, addJob: handleAddJob, dismissJob: handleDismiss }}>
      {children}
    </JobsContext>
  );
}
