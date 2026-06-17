"use client";

import React, { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import type { LeadOutcome } from "@/lib/types";

interface ConversationThread {
  leadId: string;
  businessName: string;
  messages: { id: string; subject?: string | null; content?: string | null }[];
}

interface ListRailProps {
  isLoading: boolean;
  isEmpty: boolean;
  isThreadView: boolean;
  conversationThreads: ConversationThread[];
  selectedLeadId: string | null;
  onSelectThread: (leadId: string) => void;
  unreadByLead: Map<string, number>;
  /** Optional per-thread outcome so the rail can show a small status dot. */
  outcomeByLead?: Map<string, LeadOutcome | null | undefined>;
  /** Optional per-thread venue category (Cocktail Bar, Wine Bar, etc.) for
   *  the small chip rendered under the business name. Caller is responsible
   *  for snake_case → label formatting; null/undefined hides the chip. */
  categoryByLead?: Map<string, string | null | undefined>;
  /** Renders the non-thread (drafts/sent/scheduled/etc.) list. The drafts list
   *  is bounded by the daily 20-cap so it does not need virtualizing. */
  children?: ReactNode;
  /** Bumps the fetch page size when set; passed in only for the views that
   *  use the client-side pageSize state. */
  onLoadMore: (() => void) | null;
  canLoadMore: boolean;
}

const OUTCOME_DOT: Record<string, { color: string; title: string }> = {
  interested: { color: "#10b981", title: "Interested" },
  not_interested: { color: "#ef4444", title: "Not interested" },
  snoozed: { color: "#f59e0b", title: "Snoozed" },
  converted: { color: "#3b82f6", title: "Converted" },
  lost: { color: "#71717a", title: "Lost" },
};

/**
 * Scrollable left rail used by every Outreach sub-tab. Virtualizes the
 * conversation thread list (Inbox) because it can grow to 100s of rows; the
 * non-thread branch (drafts, sent, etc.) renders children directly because
 * those lists are bounded by the daily caps and don't need virtualization.
 *
 * Fixes the 30s+ freeze the Fable Review observed: a Map<…> over 200+ threads
 * was mounting every row at once; the virtualizer keeps the DOM at ~30 row
 * elements regardless of list length.
 */
export function ListRail({
  isLoading,
  isEmpty,
  isThreadView,
  conversationThreads,
  selectedLeadId,
  onSelectThread,
  unreadByLead,
  outcomeByLead,
  categoryByLead,
  children,
  onLoadMore,
  canLoadMore,
}: ListRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: isThreadView ? conversationThreads.length : 0,
    // Baseline estimate is row-with-chip-tall so cards without one over-allocate
    // a bit instead of under-allocating and overlapping. measureElement below
    // corrects to real heights once the row mounts.
    estimateSize: () => 84,
    overscan: 8,
    getScrollElement: () => scrollRef.current,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  if (isLoading) {
    return (
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div className="p-3 space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div className="p-8 text-center" style={{ color: "var(--sp-ink-3)" }}>
          <FileText style={{ width: 28, height: 28, margin: "0 auto 8px", opacity: 0.3 }} />
          <p style={{ fontSize: 12 }}>No messages in this view.</p>
        </div>
      </div>
    );
  }

  if (isThreadView) {
    const virtualItems = virtualizer.getVirtualItems();
    return (
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualItems.map((virtualItem) => {
            const thread = conversationThreads[virtualItem.index];
            if (!thread) return null;
            const { leadId, businessName, messages: msgs } = thread;
            const isSelected =
              selectedLeadId === leadId ||
              (!selectedLeadId && conversationThreads[0]?.leadId === leadId);
            const unread = unreadByLead.get(leadId);
            return (
              <div
                key={leadId}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className={`sp-email-item${isSelected ? " selected" : ""}`}
                onClick={() => onSelectThread(leadId)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="sp-email-item-top">
                  <span className="sp-email-item-recip">{businessName}</span>
                  {(() => {
                    const o = outcomeByLead?.get(leadId);
                    if (!o || o === "ongoing") return null;
                    const meta = OUTCOME_DOT[o];
                    if (!meta) return null;
                    return (
                      <span
                        title={meta.title}
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: meta.color,
                          flexShrink: 0,
                          marginLeft: 4,
                        }}
                      />
                    );
                  })()}
                  {unread ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#ef4444",
                        color: "#fff",
                        fontSize: 9,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {unread}
                    </span>
                  ) : (
                    <span className="sp-email-item-time">{msgs.length} msg</span>
                  )}
                </div>
                {(() => {
                  const cat = categoryByLead?.get(leadId);
                  if (!cat) return null;
                  return (
                    <div style={{ marginTop: 2 }}>
                      <span style={{
                        fontSize: 10,
                        padding: "1px 7px",
                        borderRadius: 999,
                        background: "var(--sp-bg-sunken)",
                        border: "1px solid var(--sp-line)",
                        color: "var(--sp-ink-3)",
                        whiteSpace: "nowrap",
                        lineHeight: 1.5,
                        display: "inline-block",
                        textTransform: "capitalize",
                      }}>
                        {cat.replace(/_/g, " ")}
                      </span>
                    </div>
                  );
                })()}
                <div className="sp-email-item-prev">
                  {msgs[0]?.subject || msgs[0]?.content?.split("\n").filter(Boolean)[0]}
                </div>
              </div>
            );
          })}
        </div>
        {canLoadMore && onLoadMore && (
          <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
            <button
              type="button"
              onClick={onLoadMore}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Load older conversations
            </button>
          </div>
        )}
      </div>
    );
  }

  // Non-thread branch — render the caller's child list directly. The daily-cap
  // bounded drafts/sent/etc. lists don't need virtualizing.
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
      {children}
      {canLoadMore && onLoadMore && (
        <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
          <button
            type="button"
            onClick={onLoadMore}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
