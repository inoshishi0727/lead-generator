"use client";

import { useEffect } from "react";
import { X, MessageCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSommelierConversation } from "@/hooks/use-sommelier-conversations";
import type { SommelierMessage } from "@/lib/types";

interface Props {
  sessionId: string | null;
  onClose: () => void;
}

function formatDateTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseAssistantMessage(content: string): {
  message: string;
  productNames: string[];
  recipeNames: string[];
} {
  try {
    const parsed = JSON.parse(content);
    return {
      message: parsed.message || content,
      productNames: (parsed.productCards || []).map((p: any) => p.name),
      recipeNames: (parsed.recipeCards || []).map((r: any) => r.name),
    };
  } catch {
    return { message: content, productNames: [], recipeNames: [] };
  }
}

function MessageBubble({ msg }: { msg: SommelierMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-foreground">
          <div className="whitespace-pre-wrap">{msg.content}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {formatDateTime(msg.createdAt)}
          </div>
        </div>
      </div>
    );
  }

  const { message, productNames, recipeNames } = parseAssistantMessage(msg.content);
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-2xl border border-border/60 bg-muted/40 px-4 py-2.5 text-sm text-foreground">
        <div className="whitespace-pre-wrap">{message}</div>
        {productNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {productNames.map((p, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[10px] gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              >
                Product · {p}
              </Badge>
            ))}
          </div>
        )}
        {recipeNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {recipeNames.map((r, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[10px] gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              >
                Recipe · {r}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-1 text-[10px] text-muted-foreground">
          Jarvis · {formatDateTime(msg.createdAt)}
        </div>
      </div>
    </div>
  );
}

export function ConversationDetailDialog({ sessionId, onClose }: Props) {
  const { data, isLoading } = useSommelierConversation(sessionId);

  useEffect(() => {
    if (!sessionId) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [sessionId, onClose]);

  if (!sessionId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[6vh] backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-lg border border-border/50 bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Sommelier Conversation</h2>
            {data?.conversation && (
              <span className="text-[11px] text-muted-foreground">
                · {data.conversation.messagesCount} messages
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Meta */}
        {data?.conversation && (
          <div className="space-y-0.5 border-b border-border/50 bg-muted/30 px-5 py-2.5 text-[11px] text-muted-foreground">
            <div>
              <span className="font-medium text-foreground/80">Started:</span>{" "}
              {formatDateTime(data.conversation.createdAt)}
            </div>
            <div>
              <span className="font-medium text-foreground/80">Last active:</span>{" "}
              {formatDateTime(data.conversation.lastActive)}
            </div>
            {data.conversation.pageUrl && (
              <div className="flex items-center gap-1">
                <span className="font-medium text-foreground/80">Page:</span>
                <a
                  href={data.conversation.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 truncate max-w-md text-primary hover:underline"
                >
                  {data.conversation.pageUrl}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            )}
            <div className="font-mono text-[10px]">Session: {sessionId}</div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-background/50 p-5">
          {isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading conversation…
            </div>
          )}
          {data && data.messages.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No messages in this session.
            </div>
          )}
          {data?.messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
        </div>
      </div>
    </div>
  );
}
