"use client";

import { useState } from "react";
import {
  Loader2,
  Check,
  X,
  SkipForward,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  useActiveEnrich,
  storeEnrichRunId,
  type EnrichItem,
} from "@/hooks/use-active-enrich";

/** How many per-lead rows to render when expanded. A bulk run can be hundreds of
 *  leads long — we only ever show the most-recent slice, never the whole list. */
const MAX_ROWS = 50;

const ROW_ICON: Record<string, React.ReactNode> = {
  success: <Check className="h-3.5 w-3.5 text-emerald-500" />,
  failed: <X className="h-3.5 w-3.5 text-rose-500" />,
  skipped: <SkipForward className="h-3 w-3 text-muted-foreground" />,
};

function EnrichRow({ item }: { item: EnrichItem }) {
  const running = item.status === "enriching" || item.status === "pending";
  return (
    <div className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-muted/40">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          ROW_ICON[item.status] ?? <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">
          {item.business_name || item.lead_id}
        </div>
        {running && item.step && (
          <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="h-1 w-1 animate-pulse rounded-full bg-primary" />
            {item.step}
          </div>
        )}
      </div>
      {item.status === "failed" && item.error && (
        <span className="max-w-[40%] shrink-0 truncate text-xs text-rose-400/90">{item.error}</span>
      )}
      {item.status === "skipped" && (
        <span className="shrink-0 text-xs text-muted-foreground">no data found</span>
      )}
    </div>
  );
}

/**
 * Live view of the current bulk "Update missing info" enrichment run. Compact by
 * default (header + progress bar), expandable to a capped list of recent per-lead
 * rows. Persists across navigation via the run id in localStorage, so you can
 * leave the page and come back to the same progress. Sits inline on the Leads
 * page in place of the old static "check back in a few minutes" banner.
 */
export function EnrichmentProgressPanel() {
  const status = useActiveEnrich();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  if (!status || status.run_id === dismissed) return null;

  const active = status.status !== "completed" && status.status !== "failed";
  const total = status.total || status.items.length || 1;
  const done = status.completed || 0;
  const pct = active ? Math.max(4, Math.round((done / total) * 100)) : 100;

  // Most-recent-first, drop not-yet-reached rows, cap the count.
  const rows = status.items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.status !== "pending")
    .reverse()
    .slice(0, MAX_ROWS);

  const dismiss = () => {
    setDismissed(status.run_id);
    storeEnrichRunId(null);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-3.5 pb-2.5">
        <span
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            active ? "bg-primary/12 text-primary" : "bg-emerald-500/12 text-emerald-500",
          ].join(" ")}
        >
          {active ? (
            <Sparkles className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4.5 w-4.5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {active ? "Enriching leads" : "Enrichment complete"}
            </span>
            {status.failed > 0 && (
              <span className="shrink-0 rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-500">
                {status.failed} failed
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {active && status.current_lead ? (
              <>
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary align-middle" />
                <span className="text-foreground">{status.current_lead}</span>
                {status.current_step ? ` — ${status.current_step}` : ""}
              </>
            ) : active ? (
              "starting…"
            ) : (
              [
                `${status.enriched} enriched`,
                status.skipped ? `${status.skipped} skipped (no site)` : null,
                status.failed ? `${status.failed} failed` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-base font-semibold tabular-nums leading-none text-foreground">
            {done}
            <span className="text-muted-foreground">/{total}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">leads</div>
        </div>

        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Show details" : "Hide details"}
          className="ml-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        {!active && (
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mx-5 mb-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={[
            "h-full rounded-full transition-all duration-500 ease-out",
            status.status === "failed" ? "bg-rose-500" : "bg-gradient-to-r from-primary/70 to-primary",
          ].join(" ")}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Per-lead rows (capped, most recent first) */}
      {!collapsed && rows.length > 0 && (
        <div className="max-h-72 divide-y divide-border/50 overflow-auto border-t border-border/60">
          {rows.map(({ it, i }) => (
            <EnrichRow key={`${it.lead_id || it.business_name}-${i}`} item={it} />
          ))}
        </div>
      )}

      {/* Footer note */}
      <div className="border-t border-border/60 px-5 py-2 text-xs text-muted-foreground">
        {active
          ? "Leads update in the table below as they're enriched."
          : "Done — refresh scores/labels below to see the results."}
      </div>
    </div>
  );
}
