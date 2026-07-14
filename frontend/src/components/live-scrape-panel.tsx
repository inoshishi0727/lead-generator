"use client";

import { useState } from "react";
import { Loader2, Check, X, Copy, CheckCircle2 } from "lucide-react";
import { useActiveScrapeUrl } from "@/hooks/use-active-scrape-url";
import type { ScrapeBatchItem } from "@/hooks/use-scrape-batch";

const CHIP: Record<string, { cls: string; label: string }> = {
  added: { cls: "bg-emerald-500/12 text-emerald-500 border-emerald-500/25", label: "Added" },
  duplicate: { cls: "bg-amber-500/12 text-amber-500 border-amber-500/25", label: "Already have" },
  error: { cls: "bg-rose-500/12 text-rose-500 border-rose-500/25", label: "Failed" },
};

function VenueRow({ item }: { item: ScrapeBatchItem }) {
  const running = item.status === "running" || item.status === "pending";
  const chip = CHIP[item.status];
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/40">
      <span
        className={[
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          item.status === "added"
            ? "border-emerald-500/30 bg-emerald-500/10"
            : item.status === "duplicate"
              ? "border-amber-500/30 bg-amber-500/10"
              : item.status === "error"
                ? "border-rose-500/30 bg-rose-500/10"
                : "border-border bg-muted/50",
        ].join(" ")}
      >
        {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
        {item.status === "added" && <Check className="h-3.5 w-3.5 text-emerald-500" />}
        {item.status === "duplicate" && <Copy className="h-3 w-3 text-amber-500" />}
        {item.status === "error" && <X className="h-3.5 w-3.5 text-rose-500" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {item.business_name || item.input}
        </div>
        {running && item.step && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {item.step}
          </div>
        )}
        {item.status === "error" && item.error && (
          <div className="truncate text-xs text-rose-400/90">{item.error}</div>
        )}
      </div>

      {chip && (
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${chip.cls}`}
        >
          {chip.label}
        </span>
      )}
    </div>
  );
}

/**
 * Prominent, persistent live view of the current URL scrape — a polished card
 * with a header, progress bar and one row per venue showing its live step,
 * status and any failure reason. Appears whenever a scrape runs, independent of
 * the paste box, and persists after finishing until dismissed.
 */
export function LiveScrapePanel() {
  const status = useActiveScrapeUrl();
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!status || status.batch_id === dismissed) return null;

  const active = status.status !== "completed" && status.status !== "failed";
  const total = status.total || status.items.length || 1;
  const pct = active ? Math.max(6, Math.round((status.completed / total) * 100)) : 100;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <span
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            active ? "bg-primary/12 text-primary" : "bg-emerald-500/12 text-emerald-500",
          ].join(" ")}
        >
          {active ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">
            {active ? "Scraping URL" : "Scrape complete"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {active
              ? "Extracting & enriching venues from the page"
              : [
                  `${status.added} added`,
                  status.duplicate ? `${status.duplicate} already had` : null,
                  status.failed ? `${status.failed} couldn’t scrape` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold tabular-nums leading-none text-foreground">
            {status.completed}
            <span className="text-muted-foreground">/{total}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">venues</div>
        </div>

        {!active && (
          <button
            onClick={() => setDismissed(status.batch_id)}
            aria-label="Dismiss"
            className="ml-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mx-5 mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={[
            "h-full rounded-full transition-all duration-500 ease-out",
            status.status === "failed"
              ? "bg-rose-500"
              : "bg-gradient-to-r from-primary/70 to-primary",
          ].join(" ")}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Per-venue rows */}
      <div className="max-h-[22rem] divide-y divide-border/60 overflow-auto border-t border-border/60">
        {status.items.map((item, i) => (
          <VenueRow key={`${item.input}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
