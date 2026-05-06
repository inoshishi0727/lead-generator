"use client";

import { useState } from "react";
import { Search, MessageCircle, Calendar, X } from "lucide-react";
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

  const hasFilters = search || startDate || endDate;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-amber-500" />
        <h1 className="text-xl font-semibold">Sommelier Conversations</h1>
        <span className="text-xs text-muted-foreground ml-2">
          {isLoading ? "Loading…" : `${conversations.length} sessions`}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        Chats from the Asterley Sommelier widget on the Shopify store. Click any row to read the full thread.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2 pb-2 border-b border-zinc-800">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
            Search first message
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
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
            className="h-9 text-sm w-[140px]"
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
            className="h-9 text-sm w-[140px]"
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50 border-b border-zinc-800">
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">Started</th>
              <th className="px-3 py-2 font-medium">Last active</th>
              <th className="px-3 py-2 font-medium">First message</th>
              <th className="px-3 py-2 font-medium text-center">Messages</th>
              <th className="px-3 py-2 font-medium">Page</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Loading conversations…
                </td>
              </tr>
            )}
            {!isLoading && conversations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  {hasFilters
                    ? "No conversations match these filters."
                    : "No conversations yet. Once customers chat with Jarvis, they'll appear here."}
                </td>
              </tr>
            )}
            {conversations.map((c: SommelierConversation) => (
              <tr
                key={c.sessionId}
                onClick={() => setSelected(c.sessionId)}
                className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900/40 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {formatDateTime(c.createdAt)}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                  {timeAgo(c.lastActive)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="text-foreground line-clamp-2 max-w-md">
                    {c.firstUserMessage || (
                      <span className="text-muted-foreground italic">No messages yet</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className="inline-block min-w-[1.5rem] px-1.5 py-0.5 rounded-full bg-zinc-800 text-xs">
                    {c.messagesCount}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted-foreground truncate max-w-[200px]">
                  {c.pageUrl ? (
                    <span title={c.pageUrl}>{new URL(c.pageUrl).pathname}</span>
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
