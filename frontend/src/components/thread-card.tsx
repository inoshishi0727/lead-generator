"use client";

import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Mail,
  Reply,
  Clock,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MessageCard } from "@/components/message-card";
import { InboxTriage } from "@/components/inbox-triage";
import type { LeadOutcome, OutreachMessage } from "@/lib/types";

interface Props {
  leadId: string;
  businessName: string;
  messages: OutreachMessage[];
  unreadReplies?: number;
  outcome?: LeadOutcome | null;
  onOpen?: () => void;
}

/** Pill rendering for a lead's triage outcome. Returns null when there's
 *  nothing meaningful to show (null/ongoing). */
function OutcomePill({ outcome }: { outcome?: LeadOutcome | null }) {
  if (!outcome || outcome === "ongoing") return null;
  const styles: Record<string, string> = {
    interested: "border-emerald-600/50 bg-emerald-500/15 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    not_interested: "border-red-600/50 bg-red-500/15 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    snoozed: "border-amber-600/50 bg-amber-500/15 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    converted: "border-blue-600/50 bg-blue-500/15 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
    lost: "border-zinc-600/50 bg-zinc-500/15 text-zinc-900 dark:border-zinc-500/30 dark:bg-zinc-500/10 dark:text-zinc-300",
  };
  const labels: Record<string, string> = {
    interested: "Interested",
    not_interested: "Not interested",
    snoozed: "Snoozed",
    converted: "Converted",
    lost: "Lost",
  };
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 " +
        (styles[outcome] ?? "border-border bg-muted text-foreground")
      }
    >
      {labels[outcome] ?? outcome}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ThreadCard({ leadId, businessName, messages, unreadReplies = 0, outcome, onOpen }: Props) {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setExpanded(true);
  }, [leadId]);

  // Sort messages by step_number, then created_at
  const sorted = [...messages].sort((a, b) => {
    if (a.step_number !== b.step_number) return a.step_number - b.step_number;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });

  const initial = sorted.find((m) => m.step_number === 1);
  const followUps = sorted.filter((m) => m.step_number > 1);
  const sentMessages = sorted.filter((m) => m.status === "sent");
  const hasReply = sorted.some((m) => m.has_reply);
  const totalReplies = sorted.reduce((sum, m) => sum + (m.reply_count || 0), 0);
  const totalOpens = sorted.reduce((sum, m) => sum + (m.open_count || 0), 0);
  const anyOpened = sorted.some((m) => m.opened);
  const lastOpened = sorted
    .filter((m) => m.last_opened_at)
    .sort((a, b) => (b.last_opened_at || "").localeCompare(a.last_opened_at || ""))
    [0]?.last_opened_at;

  const latestActivity = sorted
    .map((m) => m.sent_at || m.created_at || "")
    .sort((a, b) => b.localeCompare(a))[0];

  const venueCategory = initial?.venue_category || sorted[0]?.venue_category;
  const contactName = initial?.contact_name || sorted[0]?.contact_name;
  const recipientEmail = initial?.recipient_email || sorted[0]?.recipient_email;

  return (
    <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
      {/* Thread header — always visible */}
      <button
        onClick={() => { if (!expanded) onOpen?.(); setExpanded(!expanded); }}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">{businessName}</span>
              {unreadReplies > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white leading-none shrink-0">
                  {unreadReplies > 9 ? "9+" : unreadReplies}
                </span>
              )}
              {venueCategory && (
                <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                  {venueCategory.replace(/_/g, " ")}
                </Badge>
              )}
              <OutcomePill outcome={outcome} />
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {contactName && <span>{contactName}</span>}
              {recipientEmail && <span className="truncate">{recipientEmail}</span>}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 shrink-0 ml-4">
          {/* Email count */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            <span>{sentMessages.length} sent</span>
            {followUps.length > 0 && (
              <span className="text-muted-foreground/60">+{followUps.length} follow-up{followUps.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Open status */}
          <div className={`flex items-center gap-1 text-xs ${anyOpened ? "text-emerald-400" : "text-muted-foreground/50"}`}>
            {anyOpened ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span>{anyOpened ? `${totalOpens}x` : "—"}</span>
          </div>

          {/* Last opened */}
          {lastOpened && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{timeAgo(lastOpened)}</span>
            </div>
          )}

          {/* Reply status */}
          <div className={`flex items-center gap-1 text-xs ${hasReply ? "text-blue-400" : "text-muted-foreground/50"}`}>
            <Reply className="h-3.5 w-3.5" />
            <span>{hasReply ? `${totalReplies}` : "—"}</span>
          </div>

          {/* Latest activity */}
          {latestActivity && (
            <span className="text-[10px] text-muted-foreground/60 w-16 text-right">
              {timeAgo(latestActivity)}
            </span>
          )}

          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Triage actions — only when the thread is open and has at least one reply */}
      {expanded && hasReply && <InboxTriage leadId={leadId} />}

      {/* Expanded: show all messages (replies shown via MessageCard's own thread view) */}
      {expanded && (
        <div className="border-t border-border/30 px-2 py-2 space-y-2">
          {sorted.map((msg) => (
            <MessageCard key={msg.id} message={msg} inConversation />
          ))}
        </div>
      )}
    </div>
  );
}
