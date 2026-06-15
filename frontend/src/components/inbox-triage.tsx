"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ThumbsUp,
  ThumbsDown,
  Clock,
  MailOpen,
} from "lucide-react";
import { toast } from "sonner";
import { updateLeadFields } from "@/lib/firestore-api";

/**
 * Triage actions shown above an open thread. Lets the operator advance the
 * lead's stage from the Inbox without leaving it.
 *
 * Stage transitions:
 *   Interested      → leads.stage = "responded".
 *   Not interested  → leads.stage = "declined".
 *   Follow up later → leads.snoozed_until = +N days; stage unchanged.
 */
const SNOOZE_OPTIONS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
];

interface Props {
  leadId: string;
  /** When provided, renders a "Mark unread" button alongside the triage
   *  actions. Wired from ThreadCard so the parent's notifications hook owns
   *  the read-state mutation. */
  onMarkUnread?: () => void;
}

export function InboxTriage({ leadId, onMarkUnread }: Props) {
  const qc = useQueryClient();
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      await updateLeadFields(leadId, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });

  function advance(label: string, patch: Record<string, unknown>) {
    mutation.mutate(patch, {
      onSuccess: () => toast.success(label),
      onError: (err) =>
        toast.error(
          `Could not update lead. ${err instanceof Error ? err.message : "Try again."}`
        ),
    });
  }

  function snooze(days: number) {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    setSnoozeOpen(false);
    advance(`Snoozed for ${days} day${days === 1 ? "" : "s"}`, {
      outcome: "snoozed",
      outcome_updated_at: new Date().toISOString(),
      snoozed_until: until,
    });
  }

  useEffect(() => {
    if (!snoozeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSnoozeOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [snoozeOpen]);

  const nowIso = () => new Date().toISOString();

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-muted/20 px-4 py-2 text-xs">
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() =>
            advance("Marked interested", {
              outcome: "interested",
              outcome_updated_at: nowIso(),
              stage: "responded",
            })
          }
          className="inline-flex items-center gap-1 rounded-md border border-emerald-600/50 bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-900 hover:bg-emerald-500/25 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <ThumbsUp size={11} />
          Interested
        </button>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() =>
            advance("Marked not interested", {
              outcome: "not_interested",
              outcome_updated_at: nowIso(),
              stage: "declined",
            })
          }
          className="inline-flex items-center gap-1 rounded-md border border-red-600/50 bg-red-500/15 px-2.5 py-1 font-medium text-red-900 hover:bg-red-500/25 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 disabled:opacity-50"
        >
          <ThumbsDown size={11} />
          Not interested
        </button>
        <div className="relative">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => setSnoozeOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-amber-600/50 bg-amber-500/15 px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-500/25 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20 disabled:opacity-50"
          >
            <Clock size={11} />
            Follow up later
          </button>
          {snoozeOpen && (
            <div
              className="absolute right-0 z-20 mt-1 min-w-32 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {SNOOZE_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => snooze(opt.days)}
                  className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  In {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {onMarkUnread && (
          <button
            type="button"
            onClick={() => {
              onMarkUnread();
              toast.success("Marked unread");
            }}
            className="inline-flex items-center gap-1 rounded-md border border-blue-600/50 bg-blue-500/15 px-2.5 py-1 font-medium text-blue-900 hover:bg-blue-500/25 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
            title="Re-flag this thread as unread"
          >
            <MailOpen size={11} />
            Mark unread
          </button>
        )}
      </div>
    </div>
  );
}
