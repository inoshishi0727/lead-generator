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
  AlarmClock,
  Building2,
  MessageSquareMore,
  Reply,
} from "lucide-react";
import { EditMessageDialog } from "@/components/edit-message-dialog";
import { LogReplyDialog } from "@/components/log-reply-dialog";
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
  const [logReplyOpen, setLogReplyOpen] = useState(false);
  const [flowingDraft, setFlowingDraft] = useState<{ subject: string | null; content: string } | null>(null);

  const { isAdmin } = useAuth();
  const updateMutation = useUpdateMessage();
  const regenerateMutation = useRegenerateMessage();
  const sendMutation = useSendMessage();
  const generatingLeadId = useGeneratingLeadId();

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
            <Badge variant="outline" className="gap-1 text-xs border-green-500/30 text-green-600">
              <Reply className="h-2.5 w-2.5" />
              {message.reply_count || 1} {(message.reply_count || 1) === 1 ? "reply" : "replies"}
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
        {/* Log Reply + Reset for sent messages */}
        {message.status === "sent" && isAdmin && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
              onClick={() => setLogReplyOpen(true)}
              disabled={isPending}
            >
              <Reply className="mr-1 h-3.5 w-3.5" />
              Log Reply
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

      {logReplyOpen && (
        <LogReplyDialog
          message={message}
          onClose={() => setLogReplyOpen(false)}
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
