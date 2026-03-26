"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { ScrapeStatus as ScrapeStatusType } from "@/lib/types";

interface Props {
  status: ScrapeStatusType;
}

const statusConfig = {
  pending: {
    label: "Pending",
    variant: "secondary" as const,
    icon: Loader2,
    color: "text-muted-foreground",
  },
  running: {
    label: "Running",
    variant: "default" as const,
    icon: Loader2,
    color: "text-primary",
  },
  completed: {
    label: "Completed",
    variant: "default" as const,
    icon: CheckCircle2,
    color: "text-green-500",
  },
  failed: {
    label: "Failed",
    variant: "destructive" as const,
    icon: XCircle,
    color: "text-destructive",
  },
};

const phaseLabels: Record<string, string> = {
  warmup: "Warming up browser...",
  scrolling: "Scrolling Google Maps feed...",
  extracting: "Extracting lead details...",
  saving: "Saving to database...",
  done: "Complete",
};

function ElapsedTime({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState("0s");

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick = () => {
      const diff = Math.floor((Date.now() - start) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <Clock className="h-3 w-3" />
      {elapsed}
    </span>
  );
}

export function ScrapeStatus({ status }: Props) {
  const cfg = statusConfig[status.status] ?? statusConfig.pending;
  const Icon = cfg.icon;
  const isActive = status.status === "pending" || status.status === "running";
  const progress = status.progress ?? 0;
  const phase = status.phase ?? "";
  const phaseLabel = phaseLabels[phase] ?? (isActive ? "Starting..." : "");

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Scrape Progress
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
          {isActive && status.started_at && (
            <ElapsedTime startedAt={status.started_at} />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Phase description */}
        <div className={`flex items-center gap-2 text-sm ${cfg.color}`}>
          <Icon
            className={`h-4 w-4 ${isActive ? "animate-spin" : ""}`}
          />
          <span>
            {isActive
              ? phaseLabel
              : status.status === "completed"
                ? `Done! Found ${status.leads_found} leads.`
                : `Error: ${status.error}`}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{isActive && status.current_lead ? `Processing: ${status.current_lead}` : ""}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stats row */}
        {(status.cards_found > 0 || status.leads_found > 0) && (
          <div className="flex gap-4 text-sm text-muted-foreground">
            {status.cards_found > 0 && (
              <span>Cards found: <strong>{status.cards_found}</strong></span>
            )}
            {status.leads_found > 0 && (
              <span>Leads extracted: <strong>{status.leads_found}</strong></span>
            )}
          </div>
        )}

        {/* Timestamps */}
        {status.started_at && (
          <p className="text-xs text-muted-foreground">
            Started: {new Date(status.started_at).toLocaleTimeString()}
            {status.completed_at &&
              ` — Completed: ${new Date(status.completed_at).toLocaleTimeString()}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
