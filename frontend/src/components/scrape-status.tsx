"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock, Check } from "lucide-react";
import type { ScrapeStatus as ScrapeStatusType } from "@/lib/types";
import { toDate } from "@/lib/time";

interface Props {
  status: ScrapeStatusType;
}

const statusConfig = {
  pending: { label: "Pending", variant: "secondary" as const, color: "text-muted-foreground" },
  running: { label: "Running", variant: "default" as const, color: "text-primary" },
  completed: { label: "Completed", variant: "default" as const, color: "text-emerald-500" },
  failed: { label: "Failed", variant: "destructive" as const, color: "text-destructive" },
};

// Pipeline stages shown in the live stepper. The backend emits coarse phases
// (warmup / scrolling / batch_N / saving / done); we map those to a stage index.
const STEPS = [
  { key: "warmup", label: "Warm up" },
  { key: "find", label: "Find venues" },
  { key: "scrape", label: "Scrape venues" },
  { key: "save", label: "Save leads" },
];

function phaseToStep(phase: string, statusStr: string): number {
  if (statusStr === "completed") return STEPS.length; // all done
  if (!phase || phase === "warmup") return 0;
  if (phase.startsWith("scroll")) return 1;
  if (phase.startsWith("batch") || phase === "extracting") return 2;
  if (phase === "saving") return 3;
  if (phase === "done") return STEPS.length;
  return 1;
}

function ElapsedTime({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState("0s");
  useEffect(() => {
    const start = toDate(startedAt).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
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

function Stepper({ active }: { active: number }) {
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors",
                  done
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-500"
                    : current
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-muted/40 text-muted-foreground",
                ].join(" ")}
              >
                {done ? (
                  <Check className="h-4 w-4" />
                ) : current ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={[
                  "text-[10px] font-medium uppercase tracking-wide",
                  current ? "text-foreground" : "text-muted-foreground",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  "mx-1 mb-4 h-0.5 flex-1 rounded transition-colors",
                  i < active ? "bg-emerald-500/50" : "bg-border",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ScrapeStatus({ status }: Props) {
  const cfg = statusConfig[status.status] ?? statusConfig.pending;
  const isActive = status.status === "pending" || status.status === "running";
  const progress = status.progress ?? 0;
  const phase = status.phase ?? "";
  const activeStep = phaseToStep(phase, status.status);

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Scrape Progress
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
          {isActive && status.started_at && <ElapsedTime startedAt={status.started_at} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live stepper */}
        <Stepper active={activeStep} />

        {/* Prominent "what's happening right now" line */}
        <div className={`flex items-center gap-2 text-sm ${cfg.color}`}>
          {isActive && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
          {status.status === "completed" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {status.status === "failed" && <XCircle className="h-4 w-4 shrink-0" />}
          <span className="min-w-0 truncate">
            {isActive && status.current_lead ? (
              <>
                Scraping{" "}
                <span className="font-semibold text-foreground">{status.current_lead}</span>
              </>
            ) : isActive ? (
              STEPS[Math.min(activeStep, STEPS.length - 1)]?.label + "…"
            ) : status.status === "completed" ? (
              `Done — found ${status.leads_found} lead${status.leads_found === 1 ? "" : "s"}.`
            ) : (
              `Error: ${status.error}`
            )}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-end text-xs text-muted-foreground">
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Live counters */}
        {(status.cards_found > 0 || status.leads_found > 0) && (
          <div className="flex gap-4 text-sm text-muted-foreground">
            {status.cards_found > 0 && (
              <span>
                Venues found: <strong className="text-foreground">{status.cards_found}</strong>
              </span>
            )}
            {status.leads_found > 0 && (
              <span>
                Leads saved: <strong className="text-foreground">{status.leads_found}</strong>
              </span>
            )}
          </div>
        )}

        {status.started_at && (
          <p className="text-xs text-muted-foreground">
            Started {new Date(status.started_at).toLocaleTimeString()}
            {status.completed_at &&
              ` — finished ${new Date(status.completed_at).toLocaleTimeString()}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
