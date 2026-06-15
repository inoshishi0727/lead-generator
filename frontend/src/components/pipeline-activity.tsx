"use client";

import { useState } from "react";
import { useLiveScrapeRun, usePipelineActivity } from "@/hooks/use-scrape";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Clock, SkipForward, Activity, AlertTriangle, X } from "lucide-react";
import { dismissScrapeRun } from "@/lib/firestore-api";
import { SCRAPE_STALE_MS, msSince } from "@/lib/stale-thresholds";
import { toast } from "sonner";

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

/** Banner showing live scrape status — always visible on the dashboard.
 *  Switches to an amber "may be stuck" state when a `status: running` doc has
 *  been hanging around longer than SCRAPE_STALE_MS, with a Dismiss action
 *  that writes `dismissed_at` so it stops showing without changing status.
 */
export function ScrapeRunningBanner() {
  const run = useLiveScrapeRun();
  const [dismissing, setDismissing] = useState(false);
  const isRunning = run?.status === "running";
  const isDismissed = !!run?.dismissed_at;
  const ageMs = run?.started_at ? msSince(run.started_at) : null;
  const isStale = isRunning && !isDismissed && ageMs !== null && ageMs > SCRAPE_STALE_MS;

  async function handleDismiss() {
    if (!run?.id) return;
    setDismissing(true);
    try {
      await dismissScrapeRun(run.id);
      toast.info("Scrape banner dismissed. Reach for it again if a fresh run starts.");
    } catch (err) {
      toast.error(
        `Could not dismiss the scrape run. ${err instanceof Error ? err.message : "Try again."}`
      );
    } finally {
      setDismissing(false);
    }
  }

  if (isRunning && isDismissed) {
    return null;
  }

  if (isStale) {
    const hours = Math.round((ageMs ?? 0) / (60 * 60 * 1000));
    const ageLabel = hours >= 24 ? `${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""} ago` : `${hours}h ago`;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
        <div className="flex-1">
          <span className="font-medium text-amber-900 dark:text-amber-300">Scrape may be stuck</span>
          {run?.source && (
            <span className="ml-2 capitalize text-amber-800 dark:text-amber-400/70">{run.source.replace(/_/g, " ")}</span>
          )}
          <span className="ml-2 text-amber-800 dark:text-amber-400/70">Started {ageLabel}</span>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={dismissing}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2 py-1 text-xs font-medium text-amber-900 dark:text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
        >
          <X size={12} />
          Dismiss
        </button>
      </div>
    );
  }

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
