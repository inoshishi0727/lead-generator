"use client";

import { useState } from "react";
import { Loader2, Inbox, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useOpenChangeRequests,
  useDecideChangeRequest,
} from "@/hooks/use-change-requests";

/**
 * Admin-only inbox of pending foundational change requests Marlow has routed
 * up. Approve materializes the change (synthesized_rules layer) or marks it
 * approved-pending-code-edit (base layer). Decline records a note.
 *
 * Mounts inside /settings/prompt-rules so admins manage Layer 2 and the
 * inbound queue in one place.
 */
export function ChangeRequestsInbox() {
  const { data: requests = [], isLoading } = useOpenChangeRequests();
  const decide = useDecideChangeRequest();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/50 bg-card p-4 text-xs text-muted-foreground">
        Loading change requests…
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-border/30 bg-emerald-500/5 p-4 text-xs">
        <div className="flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-300">
          <Inbox size={13} />
          No open change requests. Marlow has nothing to escalate.
        </div>
      </div>
    );
  }

  async function approve(id: string) {
    try {
      await decide.mutateAsync({ id, decision: "approved" });
      toast.success("Approved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed.");
    }
  }

  async function declineSubmit(id: string) {
    try {
      await decide.mutateAsync({ id, decision: "declined", note: declineNote || undefined });
      toast.info("Declined.");
      setNoteFor(null);
      setDeclineNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Decline failed.");
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-amber-500" />
        <h2 className="font-semibold text-sm">
          Change requests from Marlow ({requests.length})
        </h2>
      </div>
      <ul className="space-y-3">
        {requests.map((r) => (
          <li
            key={r.id}
            className="rounded-md border border-border/40 bg-background/40 p-3 text-xs"
          >
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium text-sm">{r.request}</p>
              <span className="rounded-full border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                {r.target_layer === "base" ? "Base prompt" : "Synthesized rules"}
              </span>
            </div>
            <p className="text-muted-foreground italic">{r.agent_reason}</p>
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Proposed edit
              </p>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">
                {r.proposed_edit}
              </pre>
            </div>
            {r.simulation_sample && (
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Sample draft with this change
                </p>
                <pre className="mt-1 whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">
                  Subject: {r.simulation_sample.subject}
                  {"\n\n"}
                  {r.simulation_sample.content}
                </pre>
              </div>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground">
              Requested {new Date(r.created_at).toLocaleString()}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => approve(r.id)}
                disabled={decide.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                title={
                  r.target_layer === "base"
                    ? "Marks approved. You still need to edit EMAIL_SYSTEM_PROMPT in functions/index.js and redeploy."
                    : "Materializes a new synthesized-rules version and activates it."
                }
              >
                {decide.isPending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                Approve
              </button>
              <button
                type="button"
                onClick={() => setNoteFor(noteFor === r.id ? null : r.id)}
                className="inline-flex items-center gap-1 rounded-md border border-red-600/50 bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-900 hover:bg-red-500/25 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
              >
                <XCircle size={11} />
                Decline
              </button>
              {r.target_layer === "base" && (
                <span className="text-[10px] font-medium text-amber-900 dark:text-amber-300/80">
                  Base-prompt changes need a manual code edit + deploy after approval.
                </span>
              )}
            </div>
            {noteFor === r.id && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Optional decline note…"
                  value={declineNote}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => declineSubmit(r.id)}
                  disabled={decide.isPending}
                  className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  Confirm decline
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
