"use client";

import { useState } from "react";
import {
  Check,
  X,
  RefreshCw,
  Mail,
  MessageCircle,
  Pencil,
  Loader2,
  Clock,
  Send,
  ChevronDown,
  ChevronUp,
  AlarmClock,
  Building2,
  MessageSquareMore,
  Reply,
  User,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { EditMessageDialog } from "@/components/edit-message-dialog";
import { RegenerateCompareDialog } from "@/components/regenerate-compare-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/menu";
import type { OutreachMessage } from "@/lib/types";
import {
  useUpdateMessage,
  useRegenerateMessage,
  useSendMessage,
  useInboundReplies,
  useDeleteReply,
} from "@/hooks/use-outreach";
import { useGeneratingLeadId } from "@/hooks/use-live-updates";
import { useAuth } from "@/lib/auth-context";

interface Props {
  message: OutreachMessage;
}

const statusColors: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  approved:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const rejectionColors: Record<string, string> = {
  current_account: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  in_discussion: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

const REJECTION_LABELS: Record<string, string> = {
  snoozed: "Snoozed",
  current_account: "Current Account",
  in_discussion: "In Discussion",
};

function rejectionLabel(reason: string): string {
  return REJECTION_LABELS[reason] ?? "rejected";
}

export function MessageCard({ message }: Props) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [flowingDraft, setFlowingDraft] = useState<{ subject: string | null; content: string } | null>(null);

  const { isAdmin } = useAuth();
  const updateMutation = useUpdateMessage();
  const regenerateMutation = useRegenerateMessage();
  const sendMutation = useSendMessage();
  const deleteReplyMutation = useDeleteReply();
  const generatingLeadId = useGeneratingLeadId();

  const repliesQuery = useInboundReplies(
    { lead_id: message.lead_id },
    { enabled: threadOpen && !!message.has_reply }
  );
  const replies = (repliesQuery.data ?? [])
    .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));

  const ChannelIcon = message.channel === "email" ? Mail : MessageCircle;
  const isRegenerating = regenerateMutation.isPending || generatingLeadId === message.lead_id;

  function handleApprove() {
    updateMutation.mutate({ id: message.id, status: "approved" });
  }

  function handleRejectWithReason(reason: string) {
    updateMutation.mutate({
      id: message.id,
      status: "rejected",
      rejection_reason: reason,
      lead_id: message.lead_id,
    });
  }

  function handleRegenerate(style: "default" | "flowing" = "default") {
    if (style === "flowing") {
      regenerateMutation.mutate(
        { id: message.id, style: "flowing", preview: true },
        {
          onSuccess: (data) => {
            setFlowingDraft({ subject: data.subject ?? null, content: data.content });
          },
        }
      );
    } else {
      regenerateMutation.mutate({ id: message.id, style: "default" });
    }
  }

  function handlePickFlowing() {
    if (!flowingDraft) return;
    updateMutation.mutate(
      { id: message.id, content: flowingDraft.content, subject: flowingDraft.subject ?? undefined },
      { onSuccess: () => setFlowingDraft(null) }
    );
  }

  function handleDialogSave(content: string, subject?: string) {
    const updates: { id: string; content: string; subject?: string } = {
      id: message.id,
      content,
    };
    if (subject !== undefined) updates.subject = subject;
    updateMutation.mutate(updates);
    setEditDialogOpen(false);
  }

  const isPending =
    updateMutation.isPending || regenerateMutation.isPending;

  return (
    <Card className={`overflow-hidden transition-opacity ${isRegenerating ? "opacity-50" : ""}`}>
      <CardContent className="space-y-3 p-4">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm">
            {message.business_name}
          </span>
          <Badge
            variant="outline"
            className={
              (message.status === "rejected" && message.rejection_reason
                ? rejectionColors[message.rejection_reason]
                : undefined) ?? statusColors[message.status] ?? ""
            }
          >
            {isRegenerating ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Regenerating
              </span>
            ) : message.status === "rejected" && message.rejection_reason ? (
              rejectionLabel(message.rejection_reason)
            ) : (
              message.status
            )}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <ChannelIcon className="h-3 w-3" />
            {message.channel === "email" ? "Email" : "DM"}
          </Badge>
          {message.venue_category && (
            <Badge variant="secondary" className="capitalize">
              {message.venue_category.replace(/_/g, " ")}
            </Badge>
          )}
          {message.step_number > 1 && (
            <Badge variant="secondary" className="text-xs">
              Step {message.step_number}
            </Badge>
          )}
          {message.tone_tier && (
            <Badge variant="outline" className="capitalize text-xs">
              {message.tone_tier.replace(/_/g, " ")}
            </Badge>
          )}
          {message.was_edited && (
            <Badge variant="outline" className="gap-1 text-xs border-blue-500/30 text-blue-500">
              <Pencil className="h-2.5 w-2.5" />
              Edited
            </Badge>
          )}
          {message.has_reply && (
            <Badge
              variant="outline"
              className="gap-1 text-xs border-green-500/30 text-green-600 cursor-pointer hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors"
              onClick={() => setThreadOpen((o) => !o)}
            >
              <Reply className="h-2.5 w-2.5" />
              {message.reply_count || 1} {(message.reply_count || 1) === 1 ? "reply" : "replies"}
              {threadOpen ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            </Badge>
          )}
          {/* Date/time */}
          {message.created_at && (
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDate(message.created_at)}
            </span>
          )}
        </div>

        {/* Context row */}
        {(message.contact_name || message.context_notes || message.recipient_email || message.website) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {message.recipient_email && (
              <p>
                To: <span className="font-medium text-foreground">{message.recipient_email}</span>
              </p>
            )}
            {message.website && (
              <p>
                Venue: <a href={message.website} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline dark:text-blue-400">{message.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>
              </p>
            )}
            {message.contact_name && (
              <p>
                Contact: <span className="font-medium text-foreground">{message.contact_name}</span>
              </p>
            )}
            {message.context_notes && <p>{message.context_notes}</p>}
          </div>
        )}

        {/* Products */}
        {message.lead_products.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {message.lead_products.map((p) => (
              <Badge key={p} variant="outline" className="text-xs">
                {p}
              </Badge>
            ))}
          </div>
        )}

        {/* Subject (email only) */}
        {message.channel === "email" && (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Subject</p>
            <p className="text-sm font-medium">
              {message.subject || "(no subject)"}
            </p>
          </div>
        )}

        {/* Message content */}
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Message</p>
          {isRegenerating ? (
            <div className="flex items-center justify-center rounded bg-muted/30 p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Regenerating draft...</span>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed rounded bg-muted/30 p-3">
              {message.content}
            </div>
          )}
        </div>

        {/* Email thread */}
        {threadOpen && (
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
              replies.map((reply, idx) => (
                <div key={reply.id} className="flex gap-2">
                  <div className="flex flex-col items-center">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                      <User className="h-3 w-3 text-green-600 dark:text-green-400" />
                    </div>
                    {idx < replies.length - 1 && (
                      <div className="mt-1 w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {reply.from_name || reply.from_email}
                      </span>
                      {reply.from_name && (
                        <span>{reply.from_email}</span>
                      )}
                      <span>{formatDate(reply.created_at)}</span>
                      {reply.source === "manual" && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">manual</Badge>
                      )}
                      {isAdmin && (
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
                    {reply.subject && (
                      <p className="text-xs font-medium mt-0.5">{reply.subject}</p>
                    )}
                    <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed rounded bg-green-50/50 dark:bg-green-950/20 border border-green-200/30 dark:border-green-800/30 p-2.5">
                      {reply.body || "(no content)"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Action buttons */}
        {message.status === "draft" && (
          <div className="flex items-center gap-2 pt-1">
            {isAdmin && (
              <Button
                size="sm"
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={handleApprove}
                disabled={isPending}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Approve
              </Button>
            )}
            {isAdmin && (
              <Menu>
                <MenuTrigger
                  disabled={isPending}
                  render={
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Reject
                      <ChevronDown className="ml-0.5 h-3 w-3" />
                    </Button>
                  }
                />
                <MenuContent side="bottom" align="start" sideOffset={4}>
                  <MenuItem onClick={() => handleRejectWithReason("snoozed")}>
                    <AlarmClock className="h-3.5 w-3.5" />
                    Snooze until next week
                  </MenuItem>
                  <MenuItem onClick={() => handleRejectWithReason("current_account")}>
                    <Building2 className="h-3.5 w-3.5" />
                    Current account
                  </MenuItem>
                  <MenuItem onClick={() => handleRejectWithReason("in_discussion")}>
                    <MessageSquareMore className="h-3.5 w-3.5" />
                    In discussion (60 days)
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
            <Menu>
              <MenuTrigger
                disabled={isPending}
                render={
                  <Button size="sm" variant="outline" disabled={isPending}>
                    {isRegenerating ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    )}
                    Regenerate
                    <ChevronDown className="ml-0.5 h-3 w-3" />
                  </Button>
                }
              />
              <MenuContent side="bottom" align="start" sideOffset={4}>
                <MenuItem onClick={() => handleRegenerate("default")}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Standard prompt
                </MenuItem>
                <MenuItem onClick={() => handleRegenerate("flowing")}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Flowing style
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditDialogOpen(true)}
              disabled={isPending}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        )}
        {/* Send + Unapprove buttons for approved messages */}
        {message.status === "approved" && isAdmin && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="default"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => sendMutation.mutate(message.id)}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Send
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateMutation.mutate({ id: message.id, status: "draft" })}
              disabled={updateMutation.isPending}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Unapprove
            </Button>
          </div>
        )}
        {/* Back to draft button for rejected messages */}
        {message.status === "rejected" && isAdmin && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateMutation.mutate({ id: message.id, status: "draft" })}
              disabled={updateMutation.isPending}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Back to Draft
            </Button>
          </div>
        )}
        {/* View Replies + Reset for sent messages */}
        {message.status === "sent" && isAdmin && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
              onClick={() => setThreadOpen((o) => !o)}
              disabled={isPending}
            >
              <Reply className="mr-1 h-3.5 w-3.5" />
              {threadOpen ? "Hide Replies" : "View Replies"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateMutation.mutate({ id: message.id, status: "draft", restore_original_email: true })}
              disabled={updateMutation.isPending}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Back to Draft
            </Button>
          </div>
        )}
      </CardContent>

      {editDialogOpen && (
        <EditMessageDialog
          message={message}
          onSave={handleDialogSave}
          onClose={() => setEditDialogOpen(false)}
        />
      )}

      {flowingDraft && (
        <RegenerateCompareDialog
          message={message}
          flowingDraft={flowingDraft}
          onPickOriginal={() => setFlowingDraft(null)}
          onPickFlowing={handlePickFlowing}
          onClose={() => setFlowingDraft(null)}
        />
      )}
    </Card>
  );
}
