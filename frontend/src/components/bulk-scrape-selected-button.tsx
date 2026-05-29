"use client";

import { useState, useEffect } from "react";
import { Zap, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { useScrapeSelectedLeads } from "@/hooks/use-scrape-leads";

interface Props {
  leadIds: string[];
  onDone?: () => void;
}

/**
 * Toolbar button + progress modal for "scrape these N selected leads".
 * Triggers /api/leads/scrape-selected and polls the batch status.
 */
export function BulkScrapeSelectedButton({ leadIds, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const { start, isStarting, status, reset, batchId } = useScrapeSelectedLeads();

  const inFlight = !!status && status.status !== "completed" && status.status !== "failed";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !inFlight && !isStarting) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, inFlight, isStarting]);

  // When batch wraps, fire onDone and refresh.
  useEffect(() => {
    if (status?.status === "completed" || status?.status === "failed") {
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.status]);

  const onConfirm = () => {
    if (leadIds.length === 0 || isStarting || inFlight) return;
    start(leadIds);
  };

  const handleClose = () => {
    if (inFlight) return;
    setOpen(false);
    reset();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={leadIds.length === 0}
        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
        title="Scrape + enrich all selected leads"
      >
        <Zap size={12} />
        Scrape selected
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh] backdrop-blur-sm"
          onClick={handleClose}
        >
          <div
            role="dialog"
            aria-labelledby="bulk-scrape-title"
            className="w-full max-w-xl rounded-lg border border-border bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="bulk-scrape-title" className="text-lg font-semibold">
                  Scrape {leadIds.length} lead{leadIds.length === 1 ? "" : "s"}?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Each lead is scraped + enriched one at a time (~60s per lead).
                  You can keep using the app while it runs.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={inFlight}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {!status && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isStarting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
                >
                  {isStarting ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  Start
                </button>
              </div>
            )}

            {status && (
              <div className="mt-4 space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {status.status === "completed"
                        ? "Done"
                        : `Processing ${status.completed} of ${status.total}…`}
                    </span>
                    <span className="tabular-nums">
                      {Math.round((status.completed / Math.max(status.total, 1)) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${(status.completed / Math.max(status.total, 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">{status.added} scraped</span>
                    <span className="text-red-600 dark:text-red-400">{status.failed} failed</span>
                  </div>
                </div>

                <ul className="max-h-[40vh] space-y-1 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2 text-sm">
                  {status.items.map((item, idx) => {
                    const colour =
                      item.status === "added"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : item.status === "error"
                          ? "text-red-600 dark:text-red-400"
                          : item.status === "running"
                            ? "text-indigo-600 dark:text-indigo-400"
                            : "text-muted-foreground";
                    const icon =
                      item.status === "added" ? <CheckCircle2 size={12} className={colour} /> :
                      item.status === "error" ? <AlertCircle size={12} className={colour} /> :
                      item.status === "running" ? <Loader2 size={12} className={colour + " animate-spin"} /> :
                      <span className="inline-block h-3 w-3 rounded-full border border-muted-foreground/40" />;
                    return (
                      <li key={idx} className="flex items-start gap-2 rounded px-2 py-1">
                        <span className="mt-0.5">{icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className={"block truncate text-xs " + colour}>
                            {item.business_name || item.input}
                          </span>
                          {item.error && (
                            <span className="block truncate text-xs text-red-600 dark:text-red-400">
                              {item.error}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={inFlight}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    {inFlight ? "Working…" : "Close"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
