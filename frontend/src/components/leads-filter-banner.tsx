"use client";

import { X } from "lucide-react";

export interface ActiveFilter {
  key: string;
  label: string;
  onClear: () => void;
}

interface LeadsFilterBannerProps {
  total: number;
  totalRaw: number;
  activeFilters: ActiveFilter[];
  onClearAll: () => void;
}

/**
 * Shown above the Leads table whenever any filter is narrowing the result
 * set. Replaces the silent "(N hidden)" hint from the old layout: now every
 * active filter is a visible chip with an inline × to clear it.
 *
 * Renders nothing when no filters are active so the page stays uncluttered.
 */
export function LeadsFilterBanner({
  total,
  totalRaw,
  activeFilters,
  onClearAll,
}: LeadsFilterBannerProps) {
  if (activeFilters.length === 0) return null;

  const hidden = totalRaw - total;

  return (
    <div className="rounded-md border border-amber-300/50 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-700/40 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-amber-900 dark:text-amber-300">
          Showing {total.toLocaleString()} of {totalRaw.toLocaleString()}
          {hidden > 0 ? ` (${hidden.toLocaleString()} hidden by filters)` : ""}
        </span>
        <span className="text-muted-foreground">·</span>
        {activeFilters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={f.onClear}
            className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 bg-background px-2 py-0.5 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
            title={`Clear ${f.label}`}
          >
            {f.label}
            <X size={10} />
          </button>
        ))}
        <button
          type="button"
          onClick={onClearAll}
          className="ml-auto text-amber-900 underline-offset-2 hover:underline dark:text-amber-300"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
