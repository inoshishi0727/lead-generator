"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Sparkles, ChevronRight } from "lucide-react";
import { useCoachChat, type CoachEnvelope } from "@/hooks/use-coach-chat";
import { MarlowConversationsSidebar } from "@/components/marlow-conversations-sidebar";
import {
  MarlowActionButtons,
  type MarlowActionCallbacks,
} from "@/components/marlow-action-buttons";

interface Props extends MarlowActionCallbacks {}

const SUGGESTION_PILLS: { label: string; prompt: string }[] = [
  {
    label: "Tune Marlow's voice",
    prompt: "Make Marlow's drafts more ",
  },
  { label: "Draft a message for…", prompt: "Draft a message for " },
  {
    label: "Update a lead",
    prompt: "Change {lead name}'s category to ",
  },
  {
    label: "Find leads…",
    prompt: "Find leads with no email after 7 days",
  },
  {
    label: "Tag a batch of leads",
    prompt: "Tag every cocktail bar in Brixton as south-london",
  },
  { label: "Snooze a lead", prompt: "Snooze {lead name} for 2 weeks" },
];

export function CoachChatPanel({
  onProposeOverlay,
  onApplyOverlay,
  onSaveAndSchedule,
  onEscalate,
  onSimulate,
}: Props) {
  const {
    turns,
    send,
    pending,
    loadingConvo,
    newChat,
    conversationId,
    activeTitle,
    loadConversation,
  } = useCoachChat();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Bumped after each completed send so the sidebar refetches the conversation
  // list — picks up the new conversation we just created OR the new
  // last_turn_at on the active one.
  const [sidebarSignal, setSidebarSignal] = useState(0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, pending]);

  // When a send completes (pending flips false after a non-empty turn list),
  // bump the sidebar refresh signal.
  const prevPendingRef = useRef(pending);
  useEffect(() => {
    if (prevPendingRef.current && !pending && turns.length > 0) {
      setSidebarSignal((n) => n + 1);
    }
    prevPendingRef.current = pending;
  }, [pending, turns.length]);

  async function handleSend() {
    const msg = draft.trim();
    if (!msg || pending || loadingConvo) return;
    setDraft("");
    await send(msg);
  }

  function applyPill(prompt: string) {
    setDraft(prompt);
    inputRef.current?.focus();
  }

  const hasUserMessages = turns.some((t) => t.role === "user");

  return (
    <div
      className="flex rounded-lg border border-border/50 bg-card overflow-hidden"
      style={{ minHeight: 480 }}
    >
      <MarlowConversationsSidebar
        activeId={conversationId}
        onSelect={(id) => {
          if (id !== conversationId) loadConversation(id);
        }}
        onNewChat={newChat}
        refreshSignal={sidebarSignal}
      />

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h2 className="font-semibold text-sm">
              {activeTitle || "Talk to Marlow"}
            </h2>
            <span className="text-[11px] text-muted-foreground">
              Cellar Master. Manages the overlay, never the base recipe.
            </span>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm"
          style={{ maxHeight: 480 }}
        >
          {!hasUserMessages && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground italic">
                Ask Marlow to shape an overlay, tag a batch of leads, or surface
                stuck ones.
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTION_PILLS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPill(p.prompt)}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                  >
                    <ChevronRight size={10} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <TurnBubble
              key={i}
              role={t.role}
              content={t.content}
              envelope={t.envelope}
              onProposeOverlay={onProposeOverlay}
              onApplyOverlay={onApplyOverlay}
              onSaveAndSchedule={onSaveAndSchedule}
              onEscalate={onEscalate}
              onSimulate={onSimulate}
            />
          ))}
          {pending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Marlow is thinking…
            </div>
          )}
          {loadingConvo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Loading conversation…
            </div>
          )}
        </div>

        <div className="border-t border-border/40 p-3 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask Marlow for an overlay…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={pending || loadingConvo || !draft.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            <Send size={12} />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function TurnBubble({
  role,
  content,
  envelope,
  onProposeOverlay,
  onApplyOverlay,
  onSaveAndSchedule,
  onEscalate,
  onSimulate,
}: {
  role: "user" | "assistant";
  content: string;
  envelope?: CoachEnvelope;
} & MarlowActionCallbacks) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : ""}>
      <div className={isUser ? "max-w-[85%]" : "max-w-[85%] w-full"}>
        <div
          className={
            "rounded-md px-3 py-2 " +
            (isUser
              ? "bg-indigo-500/10 text-foreground border border-indigo-500/20"
              : "bg-muted/30 text-foreground border border-border/40")
          }
        >
          <p className="whitespace-pre-wrap text-sm">{content}</p>
          {envelope?.proposed_overlay_md && (
            <pre className="mt-2 whitespace-pre-wrap rounded bg-background/60 p-2 text-xs">
              {envelope.proposed_overlay_md}
            </pre>
          )}
        </div>
        {envelope && envelope.action !== "chat_only" && (
          <MarlowActionButtons
            envelope={envelope}
            onProposeOverlay={onProposeOverlay}
            onApplyOverlay={onApplyOverlay}
            onSaveAndSchedule={onSaveAndSchedule}
            onEscalate={onEscalate}
            onSimulate={onSimulate}
          />
        )}
      </div>
    </div>
  );
}
