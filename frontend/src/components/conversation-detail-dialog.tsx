"use client";

import { X, MessageCircle, ExternalLink } from "lucide-react";
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
        <div className="max-w-[75%] rounded-2xl bg-blue-500/15 border border-blue-500/20 px-4 py-2.5 text-sm text-foreground">
          {msg.content}
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
      <div className="max-w-[75%] rounded-2xl bg-zinc-800/40 border border-zinc-700/50 px-4 py-2.5 text-sm text-foreground">
        <div className="whitespace-pre-wrap">{message}</div>
        {productNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {productNames.map((p, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                Product · {p}
              </span>
            ))}
          </div>
        )}
        {recipeNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {recipeNames.map((r, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                Recipe · {r}
              </span>
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

  if (!sessionId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-lg border border-zinc-700 bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
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
            className="rounded p-1 hover:bg-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {data?.conversation && (
          <div className="px-4 py-2 border-b border-zinc-800 text-[11px] text-muted-foreground space-y-0.5">
            <div>
              <span className="font-medium">Started:</span>{" "}
              {formatDateTime(data.conversation.createdAt)}
            </div>
            <div>
              <span className="font-medium">Last active:</span>{" "}
              {formatDateTime(data.conversation.lastActive)}
            </div>
            {data.conversation.pageUrl && (
              <div className="flex items-center gap-1">
                <span className="font-medium">Page:</span>
                <a
                  href={data.conversation.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-blue-400 hover:underline truncate max-w-md"
                >
                  {data.conversation.pageUrl}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            )}
            <div className="font-mono text-[10px]">Session: {sessionId}</div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && (
            <div className="text-center text-sm text-muted-foreground py-8">
              Loading conversation…
            </div>
          )}
          {data && data.messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              No messages in this session.
            </div>
          )}
          {data?.messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
        </div>
      </div>
    </div>
  );
}
