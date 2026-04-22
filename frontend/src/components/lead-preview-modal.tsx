"use client";

import { X, Mail, Reply, Eye, Star, ThumbsUp, ThumbsDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMessages, useInboundReplies } from "@/hooks/use-outreach";

interface Props {
  leadId: string;
  businessName: string;
  onClose: () => void;
  messageId?: string;
  contentRating?: "great" | "good" | "not_interested" | null;
  contentScore?: number | null;
  contentRatingReason?: string | null;
}

const RATING_META = {
  great:          { label: "Great",          icon: Star,       className: "border-amber-400/40 text-amber-400 bg-amber-400/5" },
  good:           { label: "Good",           icon: ThumbsUp,   className: "border-emerald-400/40 text-emerald-400 bg-emerald-400/5" },
  not_interested: { label: "Not interested", icon: ThumbsDown, className: "border-rose-400/40 text-rose-400 bg-rose-400/5" },
} as const;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function LeadPreviewModal({
  leadId,
  businessName,
  onClose,
  contentRating,
  contentScore,
  contentRatingReason,
}: Props) {
  const { data: messages, isLoading: msgsLoading } = useMessages({ lead_id: leadId }, 50);
  const { data: replies, isLoading: repliesLoading } = useInboundReplies({ lead_id: leadId });

  const sentMessages = (messages ?? [])
    .filter((m) => m.status === "sent" || m.sent_at)
    .sort((a, b) => (a.sent_at ?? a.created_at ?? "").localeCompare(b.sent_at ?? b.created_at ?? ""));

  const sortedReplies = (replies ?? [])
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const isLoading = msgsLoading || repliesLoading;

  const thread: { type: "sent" | "reply"; date: string; item: any }[] = [
    ...sentMessages.map((m) => ({ type: "sent" as const, date: m.sent_at ?? m.created_at ?? "", item: m })),
    ...sortedReplies.map((r) => ({ type: "reply" as const, date: r.created_at, item: r })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const ratingMeta = contentRating ? RATING_META[contentRating] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-border/50 bg-card shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold shrink-0">{businessName}</h2>
            {ratingMeta && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium shrink-0 ${ratingMeta.className}`}>
                <ratingMeta.icon className="h-3 w-3" />
                {ratingMeta.label}
                {contentScore != null && <span className="opacity-60 ml-0.5">{contentScore}/10</span>}
              </span>
            )}
            {contentRatingReason && (
              <span className="text-[10px] text-muted-foreground truncate">{contentRatingReason}</span>
            )}
          </div>
          <button onClick={onClose} className="ml-3 shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Thread */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : thread.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No messages found</p>
          ) : (
            thread.map((item, i) => (
              item.type === "sent" ? (
                <div key={i} className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {item.item.subject && (
                        <p className="text-xs font-medium">{item.item.subject}</p>
                      )}
                      {item.item.step_number > 1 && (
                        <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400">
                          Follow-up {item.item.step_number - 1}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.item.opened && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                          <Eye className="h-3 w-3" />
                          <span>{item.item.open_count ?? 1}×</span>
                        </div>
                      )}
                      <span className="text-[10px] text-muted-foreground">{formatDate(item.date)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">
                    {item.item.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-1 ml-6">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Reply className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      <p className="text-xs font-medium text-blue-400">
                        {item.item.from_name || item.item.from_email}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{formatDate(item.date)}</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">
                    {item.item.body}
                  </p>
                </div>
              )
            ))
          )}
        </div>
      </div>
    </div>
  );
}
