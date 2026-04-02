"use client";

import { useEffect, useState } from "react";
import { X, Reply } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OutcomeSelector } from "@/components/outcome-selector";
import { useLogReply } from "@/hooks/use-outreach";
import type { OutreachMessage, LeadOutcome } from "@/lib/types";

interface Props {
  message: OutreachMessage;
  currentOutcome?: LeadOutcome | null;
  onClose: () => void;
}

export function LogReplyDialog({ message, currentOutcome, onClose }: Props) {
  const [notes, setNotes] = useState("");
  const [logged, setLogged] = useState(false);
  const logReplyMutation = useLogReply();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleLog() {
    logReplyMutation.mutate(
      { lead_id: message.lead_id, message_id: message.id, notes: notes || undefined },
      { onSuccess: () => setLogged(true) }
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md rounded-lg border border-border/50 bg-card shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="border-b border-border/50 px-6 py-4">
          <div className="flex items-center gap-2">
            <Reply className="h-4 w-4 text-green-600" />
            <h2 className="text-lg font-semibold">Log Reply</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {message.business_name}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {message.venue_category && (
              <Badge variant="secondary" className="capitalize text-xs">
                {message.venue_category.replace(/_/g, " ")}
              </Badge>
            )}
            {message.recipient_email && (
              <Badge variant="outline" className="text-xs">
                {message.recipient_email}
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-4 px-6 py-4">
          {!logged ? (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Notes (optional)
                </label>
                <textarea
                  className="w-full min-h-[100px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Paste their reply or add notes..."
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleLog}
                  disabled={logReplyMutation.isPending}
                >
                  <Reply className="mr-1 h-3.5 w-3.5" />
                  {logReplyMutation.isPending ? "Logging..." : "Log Reply"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400">
                Reply logged. Lead marked as responded.
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  What's the status of this conversation?
                </p>
                <OutcomeSelector
                  leadId={message.lead_id}
                  currentOutcome={currentOutcome ?? "ongoing"}
                />
              </div>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Done
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
