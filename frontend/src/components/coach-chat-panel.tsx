"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { useCoachChat, type CoachEnvelope } from "@/hooks/use-coach-chat";

interface Props {
  /** Called when Marlow proposes an overlay; lets the page pre-fill the editor. */
  onProposeOverlay?: (overlayMd: string) => void;
  /** Called when Marlow says action=apply on a proposed overlay. */
  onApplyOverlay?: (overlayMd: string) => void;
  /** Called when Marlow says action=save_and_schedule. */
  onSaveAndSchedule?: (overlayMd: string) => void;
  /** Called when Marlow flags foundational and the operator clicks Escalate. */
  onEscalate?: (escalation: NonNullable<CoachEnvelope["escalation_payload"]>) => void;
  /** Called when Marlow says action=simulate. */
  onSimulate?: (overlayMd: string) => void;
}

/**
 * Marlow chat panel. Renders the conversation, the input box, and the action
 * buttons that come out of each assistant turn's envelope. Marlow never
 * side-effects on his own; clicking an action invokes the matching callback
 * which the parent wires to a Firestore write.
 */
export function CoachChatPanel({
  onProposeOverlay,
  onApplyOverlay,
  onSaveAndSchedule,
  onEscalate,
  onSimulate,
}: Props) {
  const { turns, send, pending, reset } = useCoachChat();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, pending]);

  async function handleSend() {
    const msg = draft.trim();
    if (!msg || pending) return;
    setDraft("");
    await send(msg);
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card flex flex-col" style={{ minHeight: 320 }}>
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h2 className="font-semibold text-sm">Talk to Marlow</h2>
          <span className="text-[11px] text-muted-foreground">
            Cellar Master. Manages the overlay, never the base recipe.
          </span>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="Start a fresh conversation"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm"
        style={{ maxHeight: 480 }}
      >
        {turns.length === 0 && (
          <div className="text-xs text-muted-foreground italic">
            Try: <span className="font-mono">"heatwave this week, push spritz serves"</span> or{" "}
            <span className="font-mono">"December gifting angle"</span>.
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
      </div>

      <div className="border-t border-border/40 p-3 flex items-center gap-2">
        <input
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
          disabled={pending || !draft.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          <Send size={12} />
          Send
        </button>
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
} & Pick<Props, "onProposeOverlay" | "onApplyOverlay" | "onSaveAndSchedule" | "onEscalate" | "onSimulate">) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : ""}>
      <div
        className={
          "max-w-[85%] rounded-md px-3 py-2 " +
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
        {envelope && envelope.action !== "chat_only" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {envelope.proposed_overlay_md && envelope.action !== "escalate" && onSimulate && (
              <button
                type="button"
                onClick={() => onSimulate(envelope.proposed_overlay_md!)}
                className="rounded-md border border-indigo-600/50 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-900 hover:bg-indigo-500/25 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
              >
                Simulate
              </button>
            )}
            {envelope.proposed_overlay_md && envelope.action === "propose" && onProposeOverlay && (
              <button
                type="button"
                onClick={() => onProposeOverlay(envelope.proposed_overlay_md!)}
                className="rounded-md border border-input bg-background px-2 py-0.5 text-[11px] hover:bg-accent"
              >
                Load into editor
              </button>
            )}
            {envelope.proposed_overlay_md && envelope.action === "apply" && onApplyOverlay && (
              <button
                type="button"
                onClick={() => onApplyOverlay(envelope.proposed_overlay_md!)}
                className="rounded-md bg-emerald-500 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-600"
              >
                Apply now
              </button>
            )}
            {envelope.proposed_overlay_md && envelope.action === "save_and_schedule" && onSaveAndSchedule && (
              <button
                type="button"
                onClick={() => onSaveAndSchedule(envelope.proposed_overlay_md!)}
                className="rounded-md border border-amber-600/50 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-500/25 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
              >
                Save and schedule
              </button>
            )}
            {envelope.foundational && envelope.escalation_payload && onEscalate && (
              <button
                type="button"
                onClick={() => onEscalate(envelope.escalation_payload!)}
                className="rounded-md border border-red-600/50 bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-900 hover:bg-red-500/25 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20"
              >
                Escalate to Rob
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
