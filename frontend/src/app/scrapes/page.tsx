"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Radar, Loader2, X, AlertCircle, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useScrape } from "@/hooks/use-scrape";
import {
  dismissScrapeRun,
  watchScrapeRuns,
  type ScrapeRunRecord,
} from "@/lib/firestore-api";

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function durationLabel(start: string, end: string | null): string {
  if (!end) return "running";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s duration`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m duration`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m duration`;
}

const PHASE_STYLES: Record<string, string> = {
  warmup: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  scrolling: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  extracting: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  saving: "bg-green-500/15 text-green-300 border-green-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function PhaseChip({ phase }: { phase?: string | null }) {
  if (!phase) {
    return (
      <Badge variant="outline" className="text-[10px] capitalize">
        unknown
      </Badge>
    );
  }
  const cls = PHASE_STYLES[phase] ?? "";
  return (
    <Badge variant="outline" className={`text-[10px] capitalize ${cls}`}>
      {phase}
    </Badge>
  );
}

function ProgressBar({ pct }: { pct: number | null | undefined }) {
  if (typeof pct !== "number" || Number.isNaN(pct)) {
    return (
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500/60" />
      </div>
    );
  }
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-blue-500 transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function LiveScrapeCard({ run }: { run: ScrapeRunRecord }) {
  const [dismissing, setDismissing] = useState(false);

  async function handleDismiss() {
    if (!run.id) return;
    setDismissing(true);
    try {
      await dismissScrapeRun(run.id);
      toast.info("Scrape dismissed");
    } catch (err) {
      toast.error(
        `Could not dismiss scrape. ${err instanceof Error ? err.message : "Try again."}`
      );
    } finally {
      setDismissing(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            <span className="text-sm font-medium capitalize">
              {run.source?.replace(/_/g, " ") || "scrape"}
            </span>
            <PhaseChip phase={run.phase} />
          </div>
          <Button
            size="xs"
            variant="ghost"
            onClick={handleDismiss}
            disabled={dismissing}
          >
            <X />
            Dismiss
          </Button>
        </div>

        <ProgressBar pct={run.progress_pct ?? null} />

        <div className="space-y-1 text-xs text-muted-foreground">
          {run.phase === "extracting" && run.current_lead && (
            <p>
              Currently scraping:{" "}
              <span className="font-medium text-foreground">
                {run.current_lead}
              </span>
            </p>
          )}
          {run.current_query && (
            <p>Query: {run.current_query}</p>
          )}
          <p>{run.leads_found} leads found</p>
          <p>started {relativeTime(run.started_at)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryRow({
  run,
  onRerun,
  isRerunning,
}: {
  run: ScrapeRunRecord;
  onRerun: (run: ScrapeRunRecord) => void;
  isRerunning: boolean;
}) {
  const isFailed = run.status === "failed";

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/30 py-3 last:border-0">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="capitalize">
            {run.source?.replace(/_/g, " ") || "scrape"}
          </span>
          <span>·</span>
          <span className="truncate text-foreground">
            {run.query || "(no query)"}
          </span>
          <span>·</span>
          {isFailed ? (
            <Badge variant="destructive" className="text-[10px]">
              failed
            </Badge>
          ) : (
            <span className="capitalize">{run.status}</span>
          )}
          <span>·</span>
          <span>{run.leads_found} leads found</span>
          <span>·</span>
          <span>{durationLabel(run.started_at, run.completed_at)}</span>
          <span>·</span>
          <span>started {relativeTime(run.started_at)}</span>
        </div>
        {isFailed && run.error && (
          <p className="flex items-start gap-1.5 text-xs text-red-400">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="break-words">{run.error}</span>
          </p>
        )}
      </div>
      {isFailed && (
        <Button
          size="xs"
          variant="outline"
          onClick={() => onRerun(run)}
          disabled={isRerunning || !run.query}
        >
          {isRerunning ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Re-run with same params
        </Button>
      )}
    </div>
  );
}

export default function ScrapesPage() {
  const [runs, setRuns] = useState<ScrapeRunRecord[] | null>(null);
  const { startScrape, isStarting } = useScrape();

  useEffect(() => {
    const unsub = watchScrapeRuns((next) => setRuns(next), 50);
    return unsub;
  }, []);

  function handleRerun(run: ScrapeRunRecord) {
    if (!run.query) {
      toast.error("This run has no query stored — can't re-run.");
      return;
    }
    startScrape({
      query: run.query,
      limit: 60,
      headless: true,
    });
  }

  const { liveRuns, historyRuns } = useMemo(() => {
    const all = runs ?? [];
    return {
      liveRuns: all.filter(
        (r) => r.status === "running" && !r.dismissed_at
      ),
      historyRuns: all.filter((r) => r.status !== "running"),
    };
  }, [runs]);

  const isLoading = runs === null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Radar className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Scrapes</h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Live
        </h2>
        {isLoading ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        ) : liveRuns.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No scrapes in progress.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {liveRuns.map((run) => (
              <LiveScrapeCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          History
        </h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Last {historyRuns.length} run{historyRuns.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : historyRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No past scrapes yet.
              </p>
            ) : (
              <div className="divide-y divide-border/30">
                {historyRuns.map((run) => (
                  <HistoryRow
                    key={run.id}
                    run={run}
                    onRerun={handleRerun}
                    isRerunning={isStarting}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
