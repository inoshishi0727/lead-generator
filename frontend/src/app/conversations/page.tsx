"use client";

import { useState } from "react";
import { Search, MessageCircle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/use-debounce";
import { useSommelierConversations } from "@/hooks/use-sommelier-conversations";
import { ConversationDetailDialog } from "@/components/conversation-detail-dialog";
import type { SommelierConversation } from "@/lib/types";

function formatDateTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ConversationsPage() {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data: conversations = [], isLoading } = useSommelierConversations({
    search: debouncedSearch || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: 200,
  });

  const clearFilters = () => {
    setSearch("");
    setStartDate("");
    setEndDate("");
  };

  const hasFilters = !!(search || startDate || endDate);
  const sessionLabel = isLoading
    ? "Loading…"
    : `${conversations.length} session${conversations.length === 1 ? "" : "s"}`;

  return (
    <div className="sp-page space-y-6">
      <div className="sp-page-head">
        <div>
          <h1 className="sp-page-title flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-amber-500" />
            Sommelier Conversations
          </h1>
          <div className="sp-page-subtitle">
            {sessionLabel} · Chats from the Asterley Sommelier widget on the Shopify store. Click any row to read the full thread.
          </div>
        </div>
        {hasFilters && (
          <div className="sp-page-actions">
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
            Search first message
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. gift, recipe, vermouth"
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
            From
          </label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-9 text-sm w-[150px]"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
            To
          </label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-9 text-sm w-[150px]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="sp-table-wrap">
        <table className="sp-tbl">
          <thead>
            <tr>
              <th>Started</th>
              <th>Last active</th>
              <th>First message</th>
              <th style={{ textAlign: "center" }}>Messages</th>
              <th>Page</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground" style={{ padding: "32px 12px" }}>
                  Loading conversations…
                </td>
              </tr>
            )}
            {!isLoading && conversations.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground" style={{ padding: "32px 12px" }}>
                  {hasFilters
                    ? "No conversations match these filters."
                    : "No conversations yet. Once customers chat with Jarvis, they'll appear here."}
                </td>
              </tr>
            )}
            {conversations.map((c: SommelierConversation) => (
              <tr key={c.sessionId} onClick={() => setSelected(c.sessionId)}>
                <td className="whitespace-nowrap">{formatDateTime(c.createdAt)}</td>
                <td className="whitespace-nowrap text-muted-foreground">{timeAgo(c.lastActive)}</td>
                <td style={{ whiteSpace: "normal" }}>
                  <div className="line-clamp-2 max-w-md">
                    {c.firstUserMessage || (
                      <span className="text-muted-foreground italic">No messages yet</span>
                    )}
                  </div>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span className="inline-block min-w-[1.5rem] px-2 py-0.5 rounded-full bg-muted text-xs font-medium">
                    {c.messagesCount}
                  </span>
                </td>
                <td className="text-[11px] text-muted-foreground truncate" style={{ maxWidth: 220 }}>
                  {c.pageUrl ? (
                    <span title={c.pageUrl}>{(() => { try { return new URL(c.pageUrl).pathname; } catch { return c.pageUrl; } })()}</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConversationDetailDialog
        sessionId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
