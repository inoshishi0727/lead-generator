"use client";

import { useState, memo } from "react";
import { Send, User, Loader2, Trash2, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/menu";
import type { OutreachMessage } from "@/lib/types";
import { useInboundReplies, useSendReply, useDeleteReply } from "@/hooks/use-outreach";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

interface Props {
  message: OutreachMessage;
  canAct: boolean;
  open: boolean;
}

export const MessageCardThread = memo(function MessageCardThread({ message, canAct, open }: Props) {
  const [replyContent, setReplyContent] = useState("");

  const repliesQuery = useInboundReplies(
    { lead_id: message.lead_id },
    { enabled: open && !!message.has_reply }
  );
  const sendReplyMutation = useSendReply();
  const deleteReplyMutation = useDeleteReply();

  if (!open) return null;

  const replies = (repliesQuery.data ?? []).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">Replies</p>

      {repliesQuery.isLoading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading replies...
        </div>
      ) : replies.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No reply content found.</p>
      ) : (
        replies.map((reply, idx) => {
          const isOutbound = reply.direction === "outbound" || reply.source === "outbound_reply";
          return (
            <div key={reply.id} className="flex gap-2">
              <div className="flex flex-col items-center">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  isOutbound ? "bg-blue-100 dark:bg-blue-900/40" : "bg-green-100 dark:bg-green-900/40"
                }`}>
                  {isOutbound ? (
                    <Send className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <User className="h-3 w-3 text-green-600 dark:text-green-400" />
                  )}
                </div>
                {idx < replies.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {isOutbound ? "Rob" : (reply.from_name || reply.from_email)}
                  </span>
                  {!isOutbound && reply.from_name && <span>{reply.from_email}</span>}
                  <span>{formatDate(reply.created_at)}</span>
                  {reply.source === "manual" && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">manual</Badge>
                  )}
                  {isOutbound && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-500/30 text-blue-500">sent</Badge>
                  )}
                  {!isOutbound && reply.sentiment && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1 py-0 ${
                        reply.sentiment === "positive"
                          ? "border-green-500/30 text-green-600 dark:text-green-400"
                          : reply.sentiment === "negative"
                          ? "border-red-500/30 text-red-600 dark:text-red-400"
                          : "border-gray-400/30 text-gray-500"
                      }`}
                      title={reply.sentiment_reason || undefined}
                    >
                      {reply.sentiment === "positive" ? "+" : reply.sentiment === "negative" ? "−" : "~"}{" "}
                      {reply.sentiment_reason || reply.sentiment}
                    </Badge>
                  )}
                  {canAct && !isOutbound && (
                    <Menu>
                      <MenuTrigger
                        render={
                          <button className="ml-auto rounded p-0.5 hover:bg-muted transition-colors">
                            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        }
                      />
                      <MenuContent side="bottom" align="end" sideOffset={4}>
                        <MenuItem
                          onClick={() => deleteReplyMutation.mutate(reply.id)}
                          className="text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete reply
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </div>
                <div className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed rounded border p-2.5 ${
                  isOutbound
                    ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/30 dark:border-blue-800/30"
                    : "bg-green-50/50 dark:bg-green-950/20 border-green-200/30 dark:border-green-800/30"
                }`}>
                  {reply.body || "(no content)"}
                </div>
              </div>
            </div>
          );
        })
      )}

      {canAct && message.status === "sent" && (
        <div className="flex gap-2 pt-2 border-t border-border">
          <textarea
            className="flex-1 min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            placeholder="Type your reply..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
          />
          <Button
            size="sm"
            className="self-end bg-blue-600 hover:bg-blue-700"
            disabled={!replyContent.trim() || sendReplyMutation.isPending}
            onClick={() => {
              sendReplyMutation.mutate(
                { lead_id: message.lead_id, message_id: message.id, content: replyContent.trim() },
                { onSuccess: () => setReplyContent("") }
              );
            }}
          >
            {sendReplyMutation.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            {sendReplyMutation.isPending ? "Sending..." : "Reply"}
          </Button>
        </div>
      )}
    </div>
  );
});
