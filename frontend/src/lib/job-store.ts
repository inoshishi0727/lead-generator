/**
 * localStorage-backed job tracking for active background operations.
 * Survives navigation and page refreshes.
 */

export type JobType = "scrape" | "enrich" | "generate" | "send" | "followups";
export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface ActiveJob {
  id: string;
  type: JobType;
  status: JobStatus;
  startedAt: string;
  progress?: number;
  phase?: string;
  detail?: string;
}

const STORAGE_KEY = "asterley_active_jobs";

function readJobs(): ActiveJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeJobs(jobs: ActiveJob[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function getActiveJobs(): ActiveJob[] {
  return readJobs().filter(
    (j) => j.status === "pending" || j.status === "running"
  );
}

export function getAllJobs(): ActiveJob[] {
  return readJobs();
}

export function addJob(type: JobType, id: string): ActiveJob {
  const jobs = readJobs();
  const job: ActiveJob = {
    id,
    type,
    status: "pending",
    startedAt: new Date().toISOString(),
  };
  // Remove any existing job with same id
  const filtered = jobs.filter((j) => j.id !== id);
  filtered.push(job);
  writeJobs(filtered);
  return job;
}

export function updateJob(
  id: string,
  updates: Partial<Pick<ActiveJob, "status" | "progress" | "phase" | "detail">>
) {
  const jobs = readJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx >= 0) {
    jobs[idx] = { ...jobs[idx], ...updates };
    writeJobs(jobs);
  }
}

export function removeJob(id: string) {
  const jobs = readJobs().filter((j) => j.id !== id);
  writeJobs(jobs);
}

export function clearCompletedJobs() {
  const jobs = readJobs().filter(
    (j) => j.status === "pending" || j.status === "running"
  );
  writeJobs(jobs);
}

/** Get the status endpoint path for a job type */
export function getStatusEndpoint(job: ActiveJob): string {
  switch (job.type) {
    case "scrape":
      return `/api/scrape-status/${job.id}`;
    case "enrich":
      return `/api/enrich-status/${job.id}`;
    case "generate":
      return `/api/outreach/generate-status/${job.id}`;
    case "send":
      return `/api/outreach/send-status/${job.id}`;
    case "followups":
      return `/api/outreach/followup-status/${job.id}`;
  }
}

/** Get the page to navigate to for a job type */
export function getJobPage(type: JobType): string {
  switch (type) {
    case "scrape":
      return "/";
    case "enrich":
      return "/leads";
    case "generate":
    case "send":
    case "followups":
      return "/outreach";
  }
}

/** Human-readable label for a job type */
export function getJobLabel(type: JobType): string {
  switch (type) {
    case "scrape":
      return "Scraping";
    case "enrich":
      return "Enriching";
    case "generate":
      return "Generating Drafts";
    case "send":
      return "Sending Emails";
    case "followups":
      return "Generating Follow-ups";
  }
}
