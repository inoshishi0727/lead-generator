"use client";

/**
 * LeadConversation — read-only chronological thread for a single lead.
 *
 * Merges our outbound emails (outreach_messages, status=sent) with the prospect's
 * inbound replies (inbound_replies) into one time-ordered transcript, rendered as
 * chat bubbles (US = right/primary, THEM = left/muted). This is the same data the
 * thread classifier reads to assign hot/warm/not_interested.
 */

import { useMemo } from "react";
import { Loader2, MessageSquare } from "lucide-react";

import { useMessages, useInboundReplies } from "@/hooks/use-outreach";
import { cn } from "@/lib/utils";

interface Turn {
  key: string;
  who: "US" | "THEM";
  t: string;
  subject?: string | null;
  text: string;
}

function fmt(t: string): string {
  if (!t) return "";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function LeadConversation({ leadId }: { leadId: string }) {
  const { data: messages, isLoading: mLoading } = useMessages({ lead_id: leadId });
  const { data: replies, isLoading: rLoading } = useInboundReplies({ lead_id: leadId });

  const turns = useMemo<Turn[]>(() => {
    const out: Turn[] = [];
    for (const m of messages ?? []) {
      if (m.status !== "sent") continue;
      out.push({ key: `m-${m.id}`, who: "US", t: m.sent_at || m.created_at || "", subject: m.subject, text: m.content || "" });
    }
    for (const r of replies ?? []) {
      out.push({
        key: `r-${r.id}`,
        who: r.direction === "outbound" ? "US" : "THEM",
        t: r.created_at || "",
        subject: r.subject,
        text: r.body || "",
      });
    }
    return out.sort((a, b) => String(a.t).localeCompare(String(b.t)));
  }, [messages, replies]);

  if (mLoading || rLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading conversation…
      </div>
    );
  }

  if (turns.length === 0) {
    return <p className="text-xs text-muted-foreground">No emails or replies yet.</p>;
  }

  return (
    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
      {turns.map((turn) => (
        <div key={turn.key} className={cn("flex", turn.who === "US" ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
              turn.who === "US"
                ? "bg-primary/15 border border-primary/25 text-foreground"
                : "bg-muted border border-border text-foreground",
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span className="font-semibold">{turn.who === "US" ? "Us" : "Them"}</span>
              <span>{fmt(turn.t)}</span>
            </div>
            {turn.subject ? <div className="mb-0.5 font-medium">{turn.subject}</div> : null}
            <div>{turn.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeadConversationHeader() {
  return (
    <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <MessageSquare className="h-3 w-3" /> Conversation
    </h3>
  );
}
