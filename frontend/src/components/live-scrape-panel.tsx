"use client";

import { useState } from "react";
import { Loader2, Check, X, CopyCheck, Globe } from "lucide-react";
import { useActiveScrapeUrl } from "@/hooks/use-active-scrape-url";
import type { ScrapeBatchItem } from "@/hooks/use-scrape-batch";

function VenueRow({ item }: { item: ScrapeBatchItem }) {
  const running = item.status === "running" || item.status === "pending";
  const detail =
    running && item.step
      ? item.step
      : item.status === "added"
        ? "added"
        : item.status === "duplicate"
          ? "already had it"
          : item.status === "error"
            ? item.error || "couldn’t scrape"
            : "queued";
  return (
    <div className="flex items-start gap-2.5 py-2">
      <span className="mt-0.5 shrink-0">
        {running && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {item.status === "added" && <Check className="h-4 w-4 text-emerald-500" />}
        {item.status === "duplicate" && <CopyCheck className="h-4 w-4 text-amber-500" />}
        {item.status === "error" && <X className="h-4 w-4 text-rose-500" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{item.business_name || item.input}</div>
        <div
          className={`text-xs ${item.status === "error" ? "text-rose-400" : "text-muted-foreground"}`}
        >
          {detail}
          {item.error && item.status !== "error" ? ` · ${item.error}` : ""}
        </div>
      </div>
    </div>
  );
}

/**
 * Prominent, persistent live view of the current URL scrape — one row per venue
 * with its live step and any failure reason. Shows itself whenever a URL scrape
 * is running (or just finished), independent of the paste box.
 */
export function LiveScrapePanel() {
  const status = useActiveScrapeUrl();
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!status || status.batch_id === dismissed) return null;

  const active = status.status !== "completed" && status.status !== "failed";
  const total = status.total || status.items.length || 1;
  const pct = active
    ? Math.max(5, Math.round((status.completed / total) * 100))
    : 100;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {active ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : (
            <Globe className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="text-sm font-semibold">
            {active ? "Scraping URL" : "Scrape finished"}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {status.completed}/{total} done · {status.added} added
            {status.duplicate ? ` · ${status.duplicate} dup` : ""}
            {status.failed ? ` · ${status.failed} failed` : ""}
          </span>
        </div>
        {!active && (
          <button
            onClick={() => setDismissed(status.batch_id)}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        )}
      </div>

      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            status.status === "failed" ? "bg-rose-500" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="max-h-80 divide-y divide-border/50 overflow-auto">
        {status.items.map((item, i) => (
          <VenueRow key={`${item.input}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
