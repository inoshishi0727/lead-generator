"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { useQuickAdd } from "@/hooks/use-quick-add";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Bulk add modal: paste one venue per line. Saves them as skeleton leads
 * (no scrape). Scraping happens later from the Leads page — either
 * per-row or via the multi-select "Scrape selected" action.
 */
export function BulkAddVenues({ open, onClose }: Props) {
  const [text, setText] = useState("");
  const mutation = useQuickAdd();

  const lines = useMemo(
    () => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [text],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !mutation.isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, mutation.isPending]);

  useEffect(() => {
    if (!open) {
      setText("");
      mutation.reset();
    }
    // mutation.reset is stable from RQ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0 || mutation.isPending) return;
    mutation.mutate(lines, {
      onSuccess: () => {
        setText("");
        onClose();
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={() => {
        if (!mutation.isPending) onClose();
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
            <h2 id="bulk-add-title" className="text-lg font-semibold">Bulk add leads</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One venue per line — Google Maps links, websites, or names. Saved as leads instantly.
              You scrape + enrich them later from the Leads page.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            spellCheck={false}
            placeholder={
              "Hops & Barley (Liverpool/Manchester)\n" +
              "Best Wines (London)\n" +
              "https://otherwine.co.uk\n" +
              "..."
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5"
            disabled={mutation.isPending}
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
                disabled={mutation.isPending}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={lines.length === 0 || mutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Save {lines.length || ""} lead{lines.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
