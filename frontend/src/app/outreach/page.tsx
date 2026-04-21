"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FileText,
  CheckCheck,
  Loader2,
  Send,
  RefreshCw,
  AlertTriangle,
  Reply,
  Search,
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
  useApprovedEmailCount,
} from "@/hooks/use-outreach";
import { getOutreachMessages } from "@/lib/firestore-api";
import { EditReflectionBanner } from "@/components/edit-reflection-banner";
import { ThreadCard } from "@/components/thread-card";

const STATUS_FILTERS = ["draft", "approved", "scheduled", "sent", "conversations", "rejected", "follow-ups", "clients", "all"] as const;

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "cocktail_bar", label: "Cocktail Bar" },
  { value: "wine_bar", label: "Wine Bar" },
  { value: "italian_restaurant", label: "Italian Restaurant" },
  { value: "gastropub", label: "Gastropub" },
  { value: "hotel_bar", label: "Hotel Bar" },
  { value: "bottle_shop", label: "Bottle Shop" },
  { value: "deli_farm_shop", label: "Deli / Farm Shop" },
  { value: "events_catering", label: "Events & Catering" },
  { value: "rtd", label: "RTD / White Label" },
  { value: "restaurant_groups", label: "Restaurant Groups" },
  { value: "festival_operators", label: "Festival Operators" },
  { value: "cookery_schools", label: "Cookery Schools" },
  { value: "corporate_gifting", label: "Corporate Gifting" },
  { value: "membership_clubs", label: "Membership Clubs" },
  { value: "airlines_trains", label: "Airlines & Trains" },
  { value: "subscription_boxes", label: "Subscription Boxes" },
  { value: "film_tv_theatre", label: "Film, TV & Theatre" },
  { value: "yacht_charter", label: "Yacht & Charter" },
  { value: "luxury_food_retail", label: "Luxury Food Retail" },
  { value: "grocery", label: "Grocery" },
];

export default function OutreachPage() {
  const { isAdmin, isMember, user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("draft");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [showSendWarning, setShowSendWarning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Member auto-scopes to own messages
  const assignedTo = isMember ? user?.uid : undefined;

  // "conversations", "follow-ups", "clients", "scheduled" are client-side filters — fetch all and filter below
  const firestoreFilter = statusFilter === "all" || statusFilter === "conversations" || statusFilter === "follow-ups" || statusFilter === "clients" || statusFilter === "scheduled"
    ? { assignedTo } as any
    : { status: statusFilter, assignedTo };

  // Use API-backed messages by default, but when viewing Follow-ups or Clients, fetch directly
  // from Firestore client to avoid server-side cache delays (live functions write directly to Firestore).
  const { data: apiMessages, isLoading: apiLoading } = useMessages(firestoreFilter);
  const [clientSideMessages, setClientSideMessages] = useState<any[] | null>(null);
  const [clientSideLoading, setClientSideLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (statusFilter === "follow-ups" || statusFilter === "clients" || statusFilter === "scheduled") {
      setClientSideLoading(true);
      getOutreachMessages({ limit: 500, assignedTo })
        .then((res) => { if (mounted) setClientSideMessages(res); })
        .catch((err) => { console.error("Failed to load messages from client Firestore", err); if (mounted) setClientSideMessages([]); })
        .finally(() => { if (mounted) setClientSideLoading(false); });
    } else {
      setClientSideMessages(null);
    }
    return () => { mounted = false; };
  }, [statusFilter]);

  const messages = (statusFilter === "follow-ups" || statusFilter === "clients" || statusFilter === "scheduled") ? (clientSideMessages ?? []) : (apiMessages ?? []);
  const isLoading = (statusFilter === "follow-ups" || statusFilter === "clients" || statusFilter === "scheduled") ? clientSideLoading : apiLoading;

  const generateMutation = useGenerateDrafts();
  const regenerateAllMutation = useRegenerateAll();
  const batchApproveMutation = useBatchApprove();
  const sendMutation = useSendApproved();
  const followupsMutation = useGenerateFollowups();

  // Build set of lead_ids that have a sent step 1 message
  const leadsWithSentEmail = new Set(
    (messages ?? [])
      .filter((m) => m.step_number === 1 && m.status === "sent")
      .map((m) => m.lead_id)
  );

  const filteredByStatus = statusFilter === "conversations"
    ? (messages ?? []).filter((m) => m.has_reply)
    : statusFilter === "follow-ups"
      ? (messages ?? []).filter((m) =>
          ((m.step_number ?? 1) > 1)
          && m.status !== "sent"
          && !m.has_reply
          && leadsWithSentEmail.has(m.lead_id)
        )
      : statusFilter === "clients"
        ? (messages ?? []).filter((m) => m.is_client_campaign)
        : statusFilter === "scheduled"
          ? (messages ?? []).filter((m) => m.status === "approved" && !!m.scheduled_send_date)
          : (statusFilter === "all")
            ? (messages ?? [])
            : (messages ?? []).filter((m) => m.status === statusFilter);
  const filteredByCategory = filteredByStatus.filter(
    (m) => !categoryFilter || m.venue_category === categoryFilter
  );
  const allMessages = useMemo(() => {
    if (!searchQuery.trim()) return filteredByCategory;
    const q = searchQuery.toLowerCase();
    return filteredByCategory.filter(
      (m) =>
        m.business_name?.toLowerCase().includes(q) ||
        m.contact_name?.toLowerCase().includes(q) ||
        m.recipient_email?.toLowerCase().includes(q) ||
        m.subject?.toLowerCase().includes(q) ||
        m.content?.toLowerCase().includes(q)
    );
  }, [filteredByCategory, searchQuery]);
  const { data: approvedEmailCount = 0 } = useApprovedEmailCount();
  const emailCapReached = approvedEmailCount >= 20;

  const draftCount = allMessages.filter((m) => m.status === "draft").length;
  const approvedCount = allMessages.filter((m) => m.status === "approved").length;
  const sentCount = allMessages.filter((m) => m.status === "sent").length;
  const repliedCount = (messages ?? []).filter((m) => m.has_reply).length;
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
              disabled={batchApproveMutation.isPending || emailCapReached}
            >
              <CheckCheck className="mr-1.5 h-4 w-4" />
              Approve All ({draftCount})
            </Button>
          )}
          {(isAdmin || isMember) && approvedCount > 0 && (
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
        </div>
      </div>

      {/* Approved email cap warning */}
      {emailCapReached && statusFilter !== "sent" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            20 emails are already approved and queued. Unapprove or reject some before approving more.
          </span>
        </div>
      )}

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

      {/* Edit reflection banner */}
      <EditReflectionBanner />

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
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
        <StatCard
          icon={Reply}
          label="Replied"
          value={repliedCount}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1 gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setSearchQuery(""); }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-xs"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
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
      {sendMutation.isSuccess && sendMutation.data?.status === "completed" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-400">
          Sent {sendMutation.data.sent}, failed {sendMutation.data.failed}
          {sendMutation.data.skipped_scheduled
            ? `, skipped by schedule ${sendMutation.data.skipped_scheduled}`
            : ""}.
        </div>
      )}

      {/* Followup status */}
      {followupsMutation.isSuccess && followupsMutation.data && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800 dark:border-purple-800 dark:bg-purple-950/20 dark:text-purple-400">
          Follow-ups: {followupsMutation.data.generated} drafted, {followupsMutation.data.skipped} skipped, {followupsMutation.data.failed} failed.
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
        ) : statusFilter === "conversations" ? (
          <div className="space-y-3">
            {(() => {
              // Group replied messages by lead_id to show full conversation threads
              const threads = new Map<string, { businessName: string; messages: typeof allMessages }>();
              for (const msg of allMessages) {
                const existing = threads.get(msg.lead_id);
                if (existing) {
                  existing.messages.push(msg);
                } else {
                  threads.set(msg.lead_id, { businessName: msg.business_name, messages: [msg] });
                }
              }
              // Sort by latest reply activity
              const sorted = [...threads.entries()].sort((a, b) => {
                const latestA = a[1].messages.reduce((max, m) => {
                  const t = m.sent_at || m.created_at || "";
                  return t > max ? t : max;
                }, "");
                const latestB = b[1].messages.reduce((max, m) => {
                  const t = m.sent_at || m.created_at || "";
                  return t > max ? t : max;
                }, "");
                return latestB.localeCompare(latestA);
              });
              return sorted.map(([leadId, { businessName, messages: msgs }]) => (
                <ThreadCard
                  key={leadId}
                  leadId={leadId}
                  businessName={businessName}
                  messages={msgs}
                />
              ));
            })()}
          </div>
        ) : (
          <div className="space-y-4">
            {allMessages.map((msg) => (
              <MessageCard key={msg.id} message={msg} emailCapReached={emailCapReached} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
