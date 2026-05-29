"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Plus, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useScrapeBatch, type ScrapeBatchItem } from "@/hooks/use-scrape-batch";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Bulk add modal: paste one venue per line, kick off a serial scrape on
 * the VPS, watch progress as each item resolves.
 *
 * Serial-only on the VPS side (concurrency=1 protects the box), so total
 * runtime is roughly N × 60s for N lines.
 */
export function BulkAddVenues({ open, onClose }: Props) {
  const [text, setText] = useState("");
  const { start, isStarting, status, batchId, reset } = useScrapeBatch();

  const lines = useMemo(
    () => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [text],
  );

  // ESC closes — only when no batch in flight, so users don't lose a run by accident.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !status) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, status]);

  // Clean up after close.
  useEffect(() => {
    if (!open) {
      setText("");
      reset();
    }
  }, [open, reset]);

  if (!open) return null;

  const inFlight = !!status && status.status !== "completed" && status.status !== "failed";
  const showResults = !!status;
  const progress = status && status.total > 0 ? (status.completed / status.total) * 100 : 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0 || isStarting || inFlight) return;
    start(lines);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={() => {
        if (!inFlight) onClose();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="bulk-add-title"
        className="w-full max-w-2xl rounded-lg border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="bulk-add-title" className="text-lg font-semibold">Bulk add venues</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste one venue per line. Google Maps links, websites, or names — auto-detected.
              Each lead is scraped + enriched.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={inFlight}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {!showResults && (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={
                "https://www.google.com/maps/place/...\n" +
                "Hops & Barley\n" +
                "https://otherwine.co.uk\n" +
                "..."
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5"
              disabled={isStarting}
              autoFocus
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {lines.length} venue{lines.length === 1 ? "" : "s"} ready
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={lines.length === 0 || isStarting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
                >
                  {isStarting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Add {lines.length || ""} venue{lines.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          </form>
        )}

        {showResults && status && (
          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {status.status === "completed"
                    ? "Done"
                    : `Processing ${status.completed} of ${status.total}…`}
                </span>
                <span className="tabular-nums">{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {status.added} added
                </span>
                <span className="text-muted-foreground">
                  {status.duplicate} duplicate
                </span>
                <span className="text-red-600 dark:text-red-400">
                  {status.failed} failed
                </span>
              </div>
            </div>

            <ul className="max-h-[40vh] space-y-1 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2 text-sm">
              {status.items.map((item, idx) => (
                <ItemRow key={idx} item={item} />
              ))}
            </ul>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
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
  );
}

function ItemRow({ item }: { item: ScrapeBatchItem }) {
  const colour =
    item.status === "added"
      ? "text-emerald-600 dark:text-emerald-400"
      : item.status === "duplicate"
        ? "text-muted-foreground"
        : item.status === "error"
          ? "text-red-600 dark:text-red-400"
          : item.status === "running"
            ? "text-indigo-600 dark:text-indigo-400"
            : "text-muted-foreground";

  const icon =
    item.status === "added" ? (
      <CheckCircle2 size={12} className={colour} />
    ) : item.status === "duplicate" ? (
      <CheckCircle2 size={12} className={colour} />
    ) : item.status === "error" ? (
      <AlertCircle size={12} className={colour} />
    ) : item.status === "running" ? (
      <Loader2 size={12} className={colour + " animate-spin"} />
    ) : (
      <span className="inline-block h-3 w-3 rounded-full border border-muted-foreground/40" />
    );

  return (
    <li className="flex items-start gap-2 rounded px-2 py-1">
      <span className="mt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-mono">{item.input}</span>
        {item.business_name && (
          <span className={"block truncate text-xs " + colour}>
            → {item.business_name}
            {item.status === "duplicate" && " (already in leads)"}
          </span>
        )}
        {item.error && (
          <span className="block truncate text-xs text-red-600 dark:text-red-400">
            {item.error}
          </span>
        )}
      </span>
    </li>
  );
}
