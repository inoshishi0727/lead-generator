"use client";

import Link from "next/link";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  Sparkles,
  FileText,
  X,
} from "lucide-react";
import { useJobs } from "@/components/jobs-provider";
import { getJobLabel, getJobPage, type ActiveJob } from "@/lib/job-store";

const typeIcons = {
  scrape: Search,
  enrich: Sparkles,
  generate: FileText,
};

function JobPill({ job, onDismiss }: { job: ActiveJob; onDismiss: () => void }) {
  const Icon = typeIcons[job.type];
  const isActive = job.status === "pending" || job.status === "running";
  const isDone = job.status === "completed";
  const isFailed = job.status === "failed";

  return (
    <Link
      href={getJobPage(job.type)}
      className="flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-medium ring-1 ring-foreground/10 transition-colors hover:bg-accent"
    >
      {isActive ? (
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
      ) : isDone ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
      ) : (
        <XCircle className="h-3 w-3 text-destructive" />
      )}
      <Icon className="h-3 w-3" />
      <span>{getJobLabel(job.type)}</span>
      {job.progress != null && isActive && (
        <span className="text-muted-foreground">{job.progress}%</span>
      )}
      {job.phase && isActive && (
        <span className="text-muted-foreground capitalize">
          {job.phase.replace(/_/g, " ")}
        </span>
      )}
      {(isDone || isFailed) && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
          className="ml-1 rounded-full p-0.5 hover:bg-muted"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </Link>
  );
}

export function ActiveJobsBar() {
  const { jobs, dismissJob } = useJobs();

  // Show all jobs that are active OR recently completed (not yet auto-dismissed)
  const visibleJobs = jobs.filter(
    (j) =>
      j.status === "pending" ||
      j.status === "running" ||
      j.status === "completed" ||
      j.status === "failed"
  );

  if (visibleJobs.length === 0) return null;

  return (
    <div className="border-b border-border/50 bg-muted/30 px-4 py-1.5">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <span className="text-xs text-muted-foreground">Active:</span>
        {visibleJobs.map((job) => (
          <JobPill
            key={job.id}
            job={job}
            onDismiss={() => dismissJob(job.id)}
          />
        ))}
      </div>
    </div>
  );
}
