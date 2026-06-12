"use client";

import { useMemo } from "react";
import { AlertCircle, Sparkles, CheckCircle2 } from "lucide-react";
import { useLeads, useEnrichLeads } from "@/hooks/use-leads";
import { isStaleEnrichment, daysSince, ENRICHMENT_STALE_DAYS } from "@/lib/stale-thresholds";

/**
 * Surfaces the leads that are stuck in pre-enrichment past the threshold.
 * Without this card, leads can sit for weeks with `enrichment_status` not
 * `"success"` and never bubble up. The card shows the oldest 5 with a
 * Re-enrich shortcut and falls back to a positive empty state otherwise.
 *
 * The threshold lives in `frontend/src/lib/stale-thresholds.ts`. Match the
 * backend threshold if you change either.
 */
export function StaleLeadsCard() {
  const { data: leads = [] } = useLeads();
  const enrich = useEnrichLeads();

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

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <div className="mb-3 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="font-medium text-amber-900 dark:text-amber-200">
          Needs attention: {stale.length} lead{stale.length === 1 ? "" : "s"} stuck in pre-enrichment
        </span>
        <span className="ml-auto text-xs text-amber-800 dark:text-amber-400/60">
          Older than {ENRICHMENT_STALE_DAYS} days
        </span>
      </div>
      <ul className="space-y-2">
        {stale.map((lead) => {
          const age = daysSince(lead.created_at ?? lead.scraped_at ?? null);
          return (
            <li
              key={lead.id}
              className="flex items-center gap-3 rounded-md bg-background/60 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">
                  {lead.business_name || "(unnamed)"}
                </p>
                <p className="text-xs text-muted-foreground">
                  added {age ?? "?"} days ago
                  {lead.enrichment_status ? ` · status: ${lead.enrichment_status}` : " · no enrichment status"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => enrich.mutate({ lead_ids: [lead.id] })}
                disabled={enrich.isPending}
                className="inline-flex items-center gap-1 rounded-md border border-amber-600/50 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 hover:bg-amber-500/25 dark:hover:bg-amber-500/20 disabled:opacity-50"
                title="Re-run enrichment on this lead"
              >
                <Sparkles size={12} />
                Re-enrich
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
