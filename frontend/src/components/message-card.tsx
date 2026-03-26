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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OutreachMessage } from "@/lib/types";
import {
  useUpdateMessage,
  useRegenerateMessage,
} from "@/hooks/use-outreach";

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

export function MessageCard({ message }: Props) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [editSubject, setEditSubject] = useState(message.subject ?? "");

  const updateMutation = useUpdateMessage();
  const regenerateMutation = useRegenerateMessage();

  const ChannelIcon = message.channel === "email" ? Mail : MessageCircle;
  const isRegenerating = regenerateMutation.isPending;

  function handleApprove() {
    const updates: { id: string; status: string; content?: string; subject?: string } = {
      id: message.id,
      status: "approved",
    };
    if (editing) {
      updates.content = editContent;
      if (message.channel === "email") updates.subject = editSubject;
    }
    updateMutation.mutate(updates);
    setEditing(false);
  }

  function handleReject() {
    updateMutation.mutate({ id: message.id, status: "rejected" });
  }

  function handleRegenerate() {
    regenerateMutation.mutate(message.id);
  }

  function handleSaveEdit() {
    const updates: { id: string; content: string; subject?: string } = {
      id: message.id,
      content: editContent,
    };
    if (message.channel === "email") updates.subject = editSubject;
    updateMutation.mutate(updates);
    setEditing(false);
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
            className={statusColors[message.status] ?? ""}
          >
            {isRegenerating ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Regenerating
              </span>
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
          {/* Date/time */}
          {message.created_at && (
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDate(message.created_at)}
            </span>
          )}
        </div>

        {/* Context row */}
        {(message.contact_name || message.context_notes) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
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
            {editing ? (
              <input
                className="w-full rounded border border-input bg-background px-2 py-1 text-sm"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
              />
            ) : (
              <p className="text-sm font-medium">
                {message.subject || "(no subject)"}
              </p>
            )}
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
          ) : editing ? (
            <textarea
              className="w-full min-h-[160px] rounded border border-input bg-background px-2 py-1.5 text-sm leading-relaxed"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed rounded bg-muted/30 p-3">
              {message.content}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {message.status === "draft" && (
          <div className="flex items-center gap-2 pt-1">
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
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReject}
              disabled={isPending}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRegenerate}
              disabled={isPending}
            >
              {isRegenerating ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Regenerate
            </Button>
            {!editing ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                disabled={isPending}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSaveEdit}
                disabled={isPending}
              >
                Save Edit
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
