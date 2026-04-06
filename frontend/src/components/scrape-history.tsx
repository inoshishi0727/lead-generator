"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useScrapeHistory } from "@/hooks/use-scrape";
import { Clock, CheckCircle2, XCircle, Loader2, Calendar } from "lucide-react";

function formatDuration(start: string, end: string | null): string {
  if (!end) return "running...";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed")
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "failed")
    return <XCircle className="h-4 w-4 text-red-500" />;
  return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
}

export function ScrapeHistory() {
  const { data: runs, isLoading } = useScrapeHistory();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Scrape History</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Scrape History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No scrape runs yet. The scraper runs automatically every Saturday at
            midnight UK time.
          </p>
        </CardContent>
      </Card>
    );
  }

  const lastRun = runs[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Scrape History</CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Next: Saturday midnight UK
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Last run highlight */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon status={lastRun.status} />
              <span className="text-sm font-medium">Last Scrape</span>
              <Badge
                variant={
                  lastRun.status === "completed"
                    ? "default"
                    : lastRun.status === "failed"
                      ? "destructive"
                      : "secondary"
                }
                className="text-[10px]"
              >
                {lastRun.status}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDate(lastRun.started_at)}
            </span>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{lastRun.leads_found} leads found</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(lastRun.started_at, lastRun.completed_at)}
            </span>
            {lastRun.source && (
              <span className="capitalize">
                {lastRun.source.replace(/_/g, " ")}
              </span>
            )}
          </div>
          {lastRun.error && (
            <p className="text-xs text-red-400 mt-1">{lastRun.error}</p>
          )}
        </div>

        {/* History list */}
        {runs.length > 1 && (
          <div className="space-y-1">
            {runs.slice(1).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between py-1.5 text-xs border-b border-border/30 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={run.status} />
                  <span className="text-muted-foreground">
                    {formatDate(run.started_at)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{run.leads_found} leads</span>
                  <span>
                    {formatDuration(run.started_at, run.completed_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
