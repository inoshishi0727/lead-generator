"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Sparkles, CheckCircle2, ChevronDown, ChevronUp, Loader2, Check, X } from "lucide-react";
import { useLeads } from "@/hooks/use-leads";
import { useScrapeSelectedLeads } from "@/hooks/use-scrape-leads";
import { isStaleEnrichment, daysSince, ENRICHMENT_STALE_DAYS } from "@/lib/stale-thresholds";

/**
 * Surfaces the leads that are stuck in pre-enrichment past the threshold.
 * Without this card, leads can sit for weeks with `enrichment_status` not
 * `"success"` and never bubble up. The card shows the oldest 5 with a
 * Re-enrich shortcut and falls back to a positive empty state otherwise.
 *
 * Re-enrich (single or batch) both route through the `/api/leads/scrape-
 * selected` batch endpoint. The synchronous `/api/leads/{id}/scrape-now`
 * route 504s at the Netlify gateway (~25s timeout) because the Gemini +
 * grounded-search pipeline takes 45-120s. The batch endpoint kicks off a
 * background job and polls for status, so it survives past the gateway
 * timeout. Single-lead Re-enrich is just a batch of size 1.
 *
 * The threshold lives in `frontend/src/lib/stale-thresholds.ts`. Match the
 * backend threshold if you change either.
 */
export function StaleLeadsCard() {
  const { data: leads = [] } = useLeads();
  const scrapeMany = useScrapeSelectedLeads();
  const [collapsed, setCollapsed] = useState(false);

  const stale = useMemo(() => {
    return leads
      .filter((l) => isStaleEnrichment(l))
      .sort((a, b) => {
        const aAge = daysSince(a.created_at ?? a.scraped_at ?? null) ?? 0;
        const bAge = daysSince(b.created_at ?? b.scraped_at ?? null) ?? 0;
        return bAge - aAge;
      })
      .slice(0, 5);
  }, [leads]);

  if (stale.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <span className="text-emerald-300">
          No leads stuck over {ENRICHMENT_STALE_DAYS} days. Pipeline is clean.
        </span>
      </div>
    );
  }

  const allStaleIds = leads.filter((l) => isStaleEnrichment(l)).map((l) => l.id);
  const batchRunning = scrapeMany.status?.status === "running" || scrapeMany.status?.status === "pending";

  // Map lead_id → per-item batch status so each row can show a live indicator
  // of what's happening to it specifically (pending / running / added / error).
  const itemByLeadId = useMemo(() => {
    const m = new Map<string, { status: string; error?: string | null }>();
    for (const item of scrapeMany.status?.items ?? []) {
      if (item.lead_id) m.set(item.lead_id, { status: item.status, error: item.error });
    }
    return m;
  }, [scrapeMany.status]);

  // The lead currently being worked on inside the batch (status === "running").
  const currentlyProcessing = useMemo(() => {
    const item = (scrapeMany.status?.items ?? []).find((it) => it.status === "running");
    if (!item?.lead_id) return null;
    const lead = leads.find((l) => l.id === item.lead_id);
    return lead?.business_name || item.business_name || "(unnamed)";
  }, [scrapeMany.status, leads]);
  const handleReEnrichAll = () => {
    if (allStaleIds.length === 0) return;
    scrapeMany.start(allStaleIds);
  };
  // Per-row re-enrich is just a batch of size 1 — same endpoint, same async
  // pattern, so it survives the gateway timeout that kills synchronous scrape-
  // now requests in prod.
  const handleReEnrichOne = (leadId: string) => {
    scrapeMany.start([leadId]);
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="font-medium text-amber-900 dark:text-amber-200">
          Needs attention: {stale.length} lead{stale.length === 1 ? "" : "s"} stuck in pre-enrichment
        </span>
        <span className="text-xs text-amber-800 dark:text-amber-400/60">
          ({allStaleIds.length} total · showing oldest {stale.length})
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleReEnrichAll}
            disabled={scrapeMany.isStarting || batchRunning}
            className="inline-flex items-center gap-1 rounded-md border border-amber-600/60 bg-amber-500/25 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-500/35 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-100 dark:hover:bg-amber-500/30 disabled:opacity-50"
            title={`Run Gemini + grounded search on all ${allStaleIds.length} stuck leads. Takes a while (about a minute per lead).`}
          >
            {scrapeMany.isStarting || batchRunning
              ? <Loader2 size={12} className="animate-spin" />
              : <Sparkles size={12} />}
            Re-enrich all ({allStaleIds.length})
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex items-center justify-center rounded p-1 text-amber-900 hover:bg-amber-500/20 dark:text-amber-200 transition-colors"
            title={collapsed ? "Show stuck leads" : "Hide stuck leads"}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>
      {/* Batch status — names the lead currently being processed so it's
          obvious what the indicator is referring to. */}
      {batchRunning && scrapeMany.status && (
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-900 dark:text-amber-300">
          <Loader2 size={11} className="animate-spin shrink-0" />
          <span>
            Re-enriching {scrapeMany.status.completed ?? 0} / {scrapeMany.status.total}
            {currentlyProcessing && (
              <> — working on <strong>{currentlyProcessing}</strong></>
            )}
          </span>
        </div>
      )}
      {!collapsed && (
        <ul className="mt-3 space-y-2">
          {stale.map((lead) => {
            const age = daysSince(lead.created_at ?? lead.scraped_at ?? null);
            const item = itemByLeadId.get(lead.id);
            const itemStatus = item?.status;
            // Visual treatment per per-lead status from the batch poll. The
            // row tints + the button changes label so the operator can see
            // exactly which leads are queued / running / done / failed.
            const isQueued = itemStatus === "pending";
            const isRunning = itemStatus === "running";
            const isDone = itemStatus === "added";
            const isFailed = itemStatus === "error" || itemStatus === "duplicate";
            const rowBg = isRunning
              ? "bg-amber-500/15 ring-1 ring-amber-500/40"
              : isDone
              ? "bg-emerald-500/10"
              : isFailed
              ? "bg-red-500/10"
              : "bg-background/60";
            return (
              <li
                key={lead.id}
                className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors ${rowBg}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium flex items-center gap-2">
                    <span className="truncate">{lead.business_name || "(unnamed)"}</span>
                    {isRunning && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-200 shrink-0">
                        <Loader2 size={10} className="animate-spin" />
                        Working…
                      </span>
                    )}
                    {isQueued && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-800/70 dark:text-amber-300/70 shrink-0">
                        Queued
                      </span>
                    )}
                    {isDone && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 shrink-0">
                        <Check size={10} />
                        Done
                      </span>
                    )}
                    {isFailed && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400 shrink-0">
                        <X size={10} />
                        Failed
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    added {age ?? "?"} days ago
                    {lead.enrichment_status ? ` · status: ${lead.enrichment_status}` : " · no enrichment status"}
                    {isFailed && item?.error && ` · ${item.error}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleReEnrichOne(lead.id)}
                  disabled={scrapeMany.isStarting || batchRunning || isQueued || isRunning || isDone}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-600/50 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 hover:bg-amber-500/25 dark:hover:bg-amber-500/20 disabled:opacity-50"
                  title="Queue Gemini + grounded-search re-enrichment. Runs in the background, takes 45-120 seconds."
                >
                  {isRunning ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {isRunning ? "Working…" : isQueued ? "Queued" : isDone ? "Done" : isFailed ? "Retry" : "Re-enrich"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
