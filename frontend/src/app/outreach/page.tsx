"use client";

import { useState } from "react";
import {
  FileText,
  CheckCheck,
  Loader2,
  Send,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/stat-card";
import { MessageCard } from "@/components/message-card";
import { useAuth } from "@/lib/auth-context";
import {
  useMessages,
  useGenerateDrafts,
  useRegenerateAll,
  useBatchApprove,
  useSendApproved,
  useGenerateFollowups,
} from "@/hooks/use-outreach";

const STATUS_FILTERS = ["all", "draft", "approved", "rejected", "sent"] as const;

export default function OutreachPage() {
  const { isAdmin } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showSendWarning, setShowSendWarning] = useState(false);

  const { data: messages, isLoading } = useMessages(
    statusFilter === "all" ? undefined : { status: statusFilter }
  );

  const generateMutation = useGenerateDrafts();
  const regenerateAllMutation = useRegenerateAll();
  const batchApproveMutation = useBatchApprove();
  const sendMutation = useSendApproved();
  const followupsMutation = useGenerateFollowups();

  const allMessages = messages ?? [];
  const draftCount = allMessages.filter((m) => m.status === "draft").length;
  const approvedCount = allMessages.filter((m) => m.status === "approved").length;
  const sentCount = allMessages.filter((m) => m.status === "sent").length;
  const draftIds = allMessages
    .filter((m) => m.status === "draft")
    .map((m) => m.id);

  function handleGenerate() {
    generateMutation.mutate(undefined);
  }

  function handleApproveAll() {
    if (draftIds.length > 0) {
      batchApproveMutation.mutate(draftIds);
    }
  }

  function handleSend(force: boolean = false) {
    sendMutation.mutate(force, {
      onSuccess: (data) => {
        if (data.status === "warning" && data.outside_optimal_window) {
          setShowSendWarning(true);
        } else {
          setShowSendWarning(false);
        }
      },
    });
  }

  function handleFollowups() {
    followupsMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
        <div data-tour="outreach-actions" className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-1.5 h-4 w-4" />
            )}
            Generate Drafts
          </Button>
          <Button
            variant="outline"
            onClick={() => regenerateAllMutation.mutate()}
            disabled={regenerateAllMutation.isPending}
          >
            {regenerateAllMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Regenerate All
          </Button>
          {draftCount > 0 && (
            <Button
              variant="outline"
              className="border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              onClick={handleApproveAll}
              disabled={batchApproveMutation.isPending}
            >
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Approve All ({draftCount})
            </Button>
          )}
          {isAdmin && approvedCount > 0 && (
            <Button
              variant="outline"
              className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"
              onClick={() => handleSend(false)}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              Send Approved ({approvedCount})
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFollowups}
              disabled={followupsMutation.isPending}
            >
              {followupsMutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Follow-ups
            </Button>
          )}
        </div>
      </div>

      {/* Send window warning */}
      {showSendWarning && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Outside optimal send window (Tue-Thu, 10am-1pm). Send anyway?
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSendWarning(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setShowSendWarning(false);
                handleSend(true);
              }}
            >
              Send Anyway
            </Button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Total Messages"
          value={allMessages.length}
        />
        <StatCard
          icon={FileText}
          label="Pending Drafts"
          value={draftCount}
        />
        <StatCard
          icon={CheckCheck}
          label="Approved"
          value={approvedCount}
        />
        <StatCard
          icon={Send}
          label="Sent"
          value={sentCount}
        />
      </div>

      {/* Status filter */}
      <div className="flex gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Generation status */}
      {generateMutation.isSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400">
          Draft generation started. Refresh in a moment to see new drafts.
        </div>
      )}

      {/* Send status */}
      {sendMutation.isSuccess && sendMutation.data?.status === "pending" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-400">
          Sending emails. This may take a few minutes due to rate limiting.
        </div>
      )}

      {/* Followup status */}
      {followupsMutation.isSuccess && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800 dark:border-purple-800 dark:bg-purple-950/20 dark:text-purple-400">
          Follow-up generation started. Refresh to see new drafts.
        </div>
      )}

      {/* Messages list */}
      <div data-tour="outreach-messages">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 p-12 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No messages yet. Generate drafts for your scored leads to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {allMessages.map((msg) => (
              <MessageCard key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
