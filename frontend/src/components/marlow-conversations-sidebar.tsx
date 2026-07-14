"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Archive,
  ArchiveRestore,
  Pencil,
  MessageSquare,
  MoreVertical,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/menu";
import {
  useMarlowConversations,
  type MarlowConversationSummary,
} from "@/hooks/use-coach-chat";
import { toDate } from "@/lib/time";

function relativeShort(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - toDate(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  /** Bumps when caller (the chat) saves a new turn so we re-fetch the list. */
  refreshSignal?: number;
}

export function MarlowConversationsSidebar({
  activeId,
  onSelect,
  onNewChat,
  refreshSignal,
}: Props) {
  const {
    conversations,
    loading,
    refresh,
    setArchived,
    rename,
    deleteConversation,
    includeArchived,
    setIncludeArchived,
  } = useMarlowConversations();

  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // refresh's identity already changes when includeArchived flips (it's in
  // useCallback's deps inside the hook), so this one effect covers mount,
  // archived-toggle, and explicit signal bumps.
  useEffect(() => {
    refresh();
  }, [refresh, refreshSignal]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.search_text.includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.first_message.toLowerCase().includes(q),
    );
  }, [conversations, query]);

  function startRename(c: MarlowConversationSummary) {
    setRenaming(c.id);
    setRenameDraft(c.title);
  }

  async function commitRename(id: string) {
    const next = renameDraft.trim();
    if (!next) {
      setRenaming(null);
      return;
    }
    try {
      await rename(id, next);
    } finally {
      setRenaming(null);
    }
  }

  async function handleDelete(c: MarlowConversationSummary) {
    if (!confirm(`Delete "${c.title}"? This can't be undone.`)) return;
    try {
      await deleteConversation(c.id);
    } catch (err) {
      console.warn("delete failed:", err);
    }
  }

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-border/40 bg-muted/10">
      <div className="border-b border-border/40 p-2 space-y-2">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
        >
          <Plus size={12} />
          New chat
        </button>
        <div className="relative">
          <Search
            size={11}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-md border border-input bg-background pl-6 pr-2 py-1 text-xs"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="h-3 w-3"
          />
          Show archived
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <p className="p-3 text-[11px] text-muted-foreground italic">
            Loading…
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-[11px] text-muted-foreground italic">
            {query ? "No matches." : "No conversations yet."}
          </p>
        ) : (
          <ul className="p-1.5 space-y-1">
            {filtered.map((c) => {
              const isActive = c.id === activeId;
              const isRenaming = renaming === c.id;
              return (
                <li key={c.id}>
                  <div
                    className={
                      "group flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-colors " +
                      (isActive
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
                        : "border-transparent hover:border-border/40 hover:bg-muted/30")
                    }
                  >
                    <MessageSquare
                      size={10}
                      className="mt-0.5 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(c.id);
                              if (e.key === "Escape") setRenaming(null);
                            }}
                            autoFocus
                            className="w-full rounded border border-input bg-background px-1 py-0.5 text-[11px]"
                          />
                          <button
                            type="button"
                            onClick={() => commitRename(c.id)}
                            className="text-emerald-400 hover:text-emerald-300"
                            title="Save"
                          >
                            <Check size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenaming(null)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Cancel"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelect(c.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center gap-1">
                            <span className="truncate font-medium">
                              {c.title}
                            </span>
                            {c.archived && (
                              <span className="text-[9px] text-muted-foreground">
                                (archived)
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span>{c.turn_count} msgs</span>
                            <span>·</span>
                            <span>{relativeShort(c.last_turn_at)}</span>
                          </div>
                        </button>
                      )}
                    </div>
                    {!isRenaming && (
                      <Menu>
                        <MenuTrigger
                          render={
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 data-popup-open:opacity-100"
                              title="More"
                              aria-label="Conversation actions"
                            >
                              <MoreVertical size={12} />
                            </button>
                          }
                        />
                        <MenuContent side="bottom" align="end" sideOffset={4} className="min-w-32">
                          <MenuItem
                            onClick={() => startRename(c)}
                          >
                            <Pencil className="size-3.5" />
                            Rename
                          </MenuItem>
                          <MenuItem
                            onClick={() => setArchived(c.id, !c.archived)}
                          >
                            {c.archived ? (
                              <ArchiveRestore className="size-3.5" />
                            ) : (
                              <Archive className="size-3.5" />
                            )}
                            {c.archived ? "Unarchive" : "Archive"}
                          </MenuItem>
                          <MenuItem
                            onClick={() => handleDelete(c)}
                            className="text-red-600 focus:bg-red-500/10 focus:text-red-600 dark:text-red-400 dark:focus:text-red-300"
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
