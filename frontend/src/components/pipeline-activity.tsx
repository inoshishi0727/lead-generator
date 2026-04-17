"use client";

import { useLiveScrapeRun, usePipelineActivity } from "@/hooks/use-scrape";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Clock, SkipForward, Activity } from "lucide-react";

const JOB_LABELS: Record<string, string> = {
  scheduled_followups: "Follow-up drafts",
  scheduled_send_followups: "Follow-up sends",
  scheduled_analytics: "Weekly analytics",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "running...";
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function resultSummary(type: string, result: Record<string, number | string> | null): string {
  if (!result) return "";
  if (result.reason) return String(result.reason);
  if (type === "scheduled_followups") {
    const parts = [];
    if (result.generated != null) parts.push(`${result.generated} generated`);
    if (result.skipped != null) parts.push(`${result.skipped} skipped`);
    return parts.join(", ");
  }
  if (type === "scheduled_send_followups") {
    const parts = [];
    if (result.sent != null) parts.push(`${result.sent} sent`);
    if (result.failed != null && Number(result.failed) > 0) parts.push(`${result.failed} failed`);
    return parts.join(", ") || "0 sent";
  }
  if (type === "scheduled_analytics") {
    return result.recipients != null ? `${result.recipients} recipient(s)` : "";
  }
  return "";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  if (status === "skipped") return <SkipForward className="h-3.5 w-3.5 text-zinc-500" />;
  return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />;
}

/** Banner showing live scrape status — always visible on the dashboard. */
export function ScrapeRunningBanner() {
  const run = useLiveScrapeRun();
  const isRunning = run?.status === "running";

  if (isRunning) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
        <div className="flex-1">
          <span className="font-medium text-blue-300">Scrape in progress</span>
          {run.source && (
            <span className="ml-2 text-blue-400/70 capitalize">{run.source.replace(/_/g, " ")}</span>
          )}
          {run.leads_found > 0 && (
            <span className="ml-2 text-blue-400/70">{run.leads_found} leads found so far</span>
          )}
        </div>
        {run.started_at && (
          <span className="text-xs text-blue-400/60 shrink-0">
            Started {formatDate(run.started_at)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-zinc-600 shrink-0" />
      No scraping ongoing
      {run?.completed_at && (
        <span className="ml-auto text-xs">Last run: {formatDate(run.completed_at)}</span>
      )}
    </div>
  );
}

/** Compact card showing last N scheduled pipeline job runs. */
export function PipelineActivity() {
  const jobs = usePipelineActivity();

  if (jobs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Pipeline Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between py-1.5 text-xs border-b border-border/30 last:border-0"
            >
              <div className="flex items-center gap-2">
                <StatusIcon status={job.status} />
                <span className="font-medium">
                  {JOB_LABELS[job.type] ?? job.type.replace(/_/g, " ")}
                </span>
                {job.status === "running" && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 animate-pulse">
                    running
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                {job.result && (
                  <span>{resultSummary(job.type, job.result)}</span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(job.started_at, job.completed_at)}
                </span>
                <span>{formatDate(job.started_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
