"use client";

import { useState } from "react";
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
import type { OutreachMessage } from "@/lib/types";

interface Props {
  leadId: string;
  businessName: string;
  messages: OutreachMessage[];
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

export function ThreadCard({ leadId, businessName, messages }: Props) {
  const [expanded, setExpanded] = useState(false);

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
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm truncate">{businessName}</span>
              {venueCategory && (
                <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                  {venueCategory.replace(/_/g, " ")}
                </Badge>
              )}
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

      {/* Expanded: show all messages */}
      {expanded && (
        <div className="border-t border-border/30 px-2 py-2 space-y-2">
          {sorted.map((msg) => (
            <MessageCard key={msg.id} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}
