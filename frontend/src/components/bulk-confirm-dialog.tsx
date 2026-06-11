"use client";

import { useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";

interface BulkConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  /** Optional breakdown chips (e.g. "Wine Bar · 12", "Strong fit · 8"). */
  breakdown?: string[];
  /** Label on the confirm button. */
  confirmLabel: string;
  /** Visual treatment for destructive operations (rebuilds, deletes). */
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * Shared confirm dialog used by every bulk operation on Outreach:
 *   - Scoped Approve ("Approve these N [cohort]")
 *   - Regenerate All
 *   - any future bulk destructive op
 *
 * Why one component: the page-head used to render "Regenerate All" one click
 * from "Approve All (171)" with no confirm on either. A misclick wiped
 * unsaved drafts. The Fable Review flagged this as a blast-radius collision.
 * One shared dialog with required confirm + clear destructive variant keeps
 * the two visually + behaviourally distinct without leaving "are you sure"
 * up to each call site.
 */
export function BulkConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  breakdown,
  confirmLabel,
  destructive = false,
  disabled = false,
}: BulkConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="bulk-confirm-title"
        className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {destructive && (
              <div className="mt-0.5 rounded-full bg-amber-100 p-1.5 dark:bg-amber-950/40">
                <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
              </div>
            )}
            <div>
              <h2 id="bulk-confirm-title" className="text-base font-semibold">
                {title}
              </h2>
              {description && (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {breakdown && breakdown.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {breakdown.map((label) => (
              <span
                key={label}
                className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            disabled={disabled}
            className={
              destructive
                ? "rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                : "rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
