"use client";

import { useState, useEffect, useMemo } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useSearchParams } from "next/navigation";
import {
  FileText,
  CheckCheck,
  Loader2,
  Send,
  RefreshCw,
  AlertTriangle,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { useReplyNotifications } from "@/hooks/use-notifications";

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
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [statusFilter, setStatusFilter] = useState<string>(
    STATUS_FILTERS.includes(initialTab as any) ? initialTab! : "draft"
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [stepFilter, setStepFilter] = useState<string>("all");
  const [showSendWarning, setShowSendWarning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 200);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  // Member auto-scopes to own messages
  const assignedTo = isMember ? user?.uid : undefined;

  // "conversations", "follow-ups", "clients", "scheduled" are client-side filters — fetch all and filter below
  const firestoreFilter = statusFilter === "all" || statusFilter === "conversations" || statusFilter === "follow-ups" || statusFilter === "clients" || statusFilter === "scheduled"
    ? { assignedTo } as any
    : { status: statusFilter, assignedTo };

  // Universal fetch for stat cards — always all messages regardless of current tab
  const { data: universalApiMessages } = useMessages({ assignedTo } as any, 1000);

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

  const { replies: inboundReplies, lastReadAt, markLeadRead } = useReplyNotifications();

  // Count unread replies per lead (for per-thread badges)
  const unreadByLead = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of inboundReplies) {
      if (lastReadAt && r.created_at <= lastReadAt) continue;
      if (!r.lead_id) continue;
      map.set(r.lead_id, (map.get(r.lead_id) ?? 0) + 1);
    }
    return map;
  }, [inboundReplies, lastReadAt]);

  const unreadConversations = useMemo(
    () => [...unreadByLead.values()].filter((c) => c > 0).length,
    [unreadByLead]
  );

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
    ? (messages ?? []).filter((m) => m.has_reply && !m.is_client_campaign)
    : statusFilter === "follow-ups"
      ? (messages ?? []).filter((m) =>
          ((m.step_number ?? 1) > 1)
          && m.status !== "sent"
          && !m.has_reply
          && leadsWithSentEmail.has(m.lead_id)
          && !m.is_client_campaign
        )
      : statusFilter === "clients"
        ? (messages ?? []).filter((m) => m.is_client_campaign)
        : statusFilter === "scheduled"
          ? (messages ?? []).filter((m) => m.status === "approved" && !!m.scheduled_send_date && !m.is_client_campaign)
          : (statusFilter === "all")
            ? (messages ?? []).filter((m) => !m.is_client_campaign)
            : (messages ?? []).filter((m) => m.status === statusFilter && !m.is_client_campaign);
  const filteredByCategory = filteredByStatus.filter(
    (m) => !categoryFilter || m.venue_category === categoryFilter
  );
  const filteredByStep = useMemo(() => {
    if (stepFilter === "all") return filteredByCategory;
    const step = stepFilter === "initial" ? 1 : stepFilter === "followup1" ? 2 : stepFilter === "followup2" ? 3 : 4;
    return filteredByCategory.filter((m) => (m.step_number ?? 1) === step);
  }, [filteredByCategory, stepFilter]);

  const allMessages = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return filteredByStep;
    const q = debouncedSearchQuery.toLowerCase();
    return filteredByStep.filter(
      (m) =>
        m.business_name?.toLowerCase().includes(q) ||
        m.contact_name?.toLowerCase().includes(q) ||
        m.recipient_email?.toLowerCase().includes(q) ||
        m.subject?.toLowerCase().includes(q) ||
        m.content?.toLowerCase().includes(q)
    );
  }, [filteredByStep, debouncedSearchQuery]);
  const { data: approvedEmailCount = 0 } = useApprovedEmailCount();
  const emailCapReached = approvedEmailCount >= 20;

  const dynamicCategoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    filteredByStatus.forEach((m) => {
      if (m.venue_category) counts.set(m.venue_category, (counts.get(m.venue_category) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([value, count]) => ({
        value,
        count,
        label: CATEGORY_OPTIONS.find((o) => o.value === value)?.label
          ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
  }, [filteredByStatus]);

  // A lead/step should have at most one live email (draft or approved). When
  // two or more appear in the current view, mark every offending row so the
  // user can resolve the collision manually.
  const duplicateIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of messages ?? []) {
      if (m.channel !== "email") continue;
      if (m.status !== "draft" && m.status !== "approved") continue;
      const key = `${m.lead_id}:${m.step_number ?? 1}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const dupKeys = new Set<string>();
    for (const [key, count] of counts) {
      if (count > 1) dupKeys.add(key);
    }
    const ids = new Set<string>();
    for (const m of messages ?? []) {
      if (m.channel !== "email") continue;
      if (m.status !== "draft" && m.status !== "approved") continue;
      const key = `${m.lead_id}:${m.step_number ?? 1}`;
      if (dupKeys.has(key)) ids.add(m.id);
    }
    return ids;
  }, [messages]);

  const universalMessages = (universalApiMessages ?? []).filter((m) => !m.is_client_campaign);
  const draftCount = universalMessages.filter((m) => m.status === "draft").length;
  const approvedCount = universalMessages.filter((m) => m.status === "approved").length;
  const sentCount = universalMessages.filter((m) => m.status === "sent").length;
  const repliedCount = universalMessages.filter((m) => m.has_reply).length;
  const draftsByStep = useMemo(() => {
    const drafts = universalMessages.filter((m) => m.status === "draft");
    return {
      initial: drafts.filter((m) => (m.step_number ?? 1) === 1).length,
      followUp1: drafts.filter((m) => m.step_number === 2).length,
      followUp2: drafts.filter((m) => m.step_number === 3).length,
      followUp3Plus: drafts.filter((m) => (m.step_number ?? 1) >= 4).length,
    };
  }, [universalMessages]);
  const draftIds = allMessages
    .filter((m) => m.status === "draft")
    .map((m) => m.id);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const conversationThreads = useMemo(() => {
    if (statusFilter !== "conversations") return null;
    const threads = new Map<string, { leadId: string; businessName: string; messages: typeof allMessages }>();
    for (const msg of allMessages) {
      if (!threads.has(msg.lead_id)) {
        threads.set(msg.lead_id, { leadId: msg.lead_id, businessName: msg.business_name, messages: [] });
      }
      threads.get(msg.lead_id)!.messages.push(msg);
    }
    return Array.from(threads.values()).sort((a, b) => {
      const latest = (msgs: typeof allMessages) =>
        msgs.reduce((m, x) => { const t = x.sent_at || x.created_at || ""; return t > m ? t : m; }, "");
      return latest(b.messages).localeCompare(latest(a.messages));
    });
  }, [allMessages, statusFilter]);

  const selectedMessage = allMessages.find((m) => m.id === selectedMessageId) ?? allMessages[0] ?? null;
  const selectedThread = conversationThreads?.find((t) => t.leadId === selectedLeadId) ?? conversationThreads?.[0] ?? null;

  useEffect(() => {
    setSelectedMessageId(allMessages[0]?.id ?? null);
    setSelectedLeadId(conversationThreads?.[0]?.leadId ?? null);
  }, [statusFilter, categoryFilter, stepFilter, debouncedSearchQuery]);

  function handleGenerate() {
    generateMutation.mutate(undefined);
  }

  function handleApproveAll() {
    if (draftIds.length > 0) {
      batchApproveMutation.mutate(draftIds, {
        onSuccess: (data) => {
          const skipped = (data as { skipped_duplicates?: number }).skipped_duplicates ?? 0;
          if (skipped > 0) {
            toast.warning(
              `${skipped} draft${skipped > 1 ? "s" : ""} skipped — lead already has a live email outreach.`
            );
          }
        },
      });
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

  const STATUS_FILTER_LABELS: Record<string, string> = {
    draft: "Draft", approved: "Approved", scheduled: "Scheduled",
    sent: "Sent", conversations: "Inbox", rejected: "Rejected",
    "follow-ups": "Follow-ups", clients: "Clients", all: "All",
  };

  return (
    <div
      style={{
        position: "fixed",
        top: "var(--sp-topbar-h)",
        left: "var(--sp-sidebar-w)",
        right: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--sp-bg)",
      }}
    >
      {/* Page head */}
      <div className="sp-page-head" style={{ margin: 0, padding: "16px 28px 12px" }}>
        <div>
          <h1 className="sp-page-title">Outreach</h1>
          <div className="sp-page-subtitle">
            {draftCount} drafts · {approvedCount} approved · {sentCount} sent · {repliedCount} replied
          </div>
        </div>
        <div data-tour="outreach-actions" className="sp-page-actions">
          <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
            {generateMutation.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <FileText className="mr-1.5 h-4 w-4" />}
            Generate Drafts
          </Button>
          <Button variant="outline" onClick={() => regenerateAllMutation.mutate()} disabled={regenerateAllMutation.isPending}>
            {regenerateAllMutation.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-1.5 h-4 w-4" />}
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
              {sendMutation.isPending
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <Send className="mr-1.5 h-4 w-4" />}
              Send Approved ({approvedCount})
            </Button>
          )}
        </div>
      </div>

      {/* Compact alerts */}
      {emailCapReached && statusFilter !== "sent" && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400" style={{ flexShrink: 0, margin: "0 28px 4px" }}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          20 emails queued — unapprove or reject some before approving more.
        </div>
      )}
      {showSendWarning && (
        <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400" style={{ flexShrink: 0, margin: "0 28px 4px" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Outside optimal send window (Tue–Thu, 10am–1pm). Send anyway?
          </div>
          <div className="flex gap-2 ml-4">
            <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setShowSendWarning(false)}>Cancel</Button>
            <Button size="sm" className="h-6 text-xs px-2" onClick={() => { setShowSendWarning(false); handleSend(true); }}>Send Anyway</Button>
          </div>
        </div>
      )}
      {(generateMutation.isSuccess || (sendMutation.isSuccess && sendMutation.data) || (followupsMutation.isSuccess && followupsMutation.data)) && (
        <div className="flex items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400" style={{ flexShrink: 0, margin: "0 28px 4px" }}>
          {generateMutation.isSuccess && <span>Draft generation started.</span>}
          {sendMutation.isSuccess && sendMutation.data?.status === "completed" && (
            <span>Sent {sendMutation.data.sent}, failed {sendMutation.data.failed}{sendMutation.data.skipped_scheduled ? `, skipped ${sendMutation.data.skipped_scheduled}` : ""}.</span>
          )}
          {sendMutation.isSuccess && sendMutation.data?.status === "pending" && <span>Sending emails…</span>}
          {followupsMutation.isSuccess && followupsMutation.data && (
            <span>Follow-ups: {followupsMutation.data.generated} drafted.</span>
          )}
        </div>
      )}

      <EditReflectionBanner />

      {/* Gmail-style split pane */}
      {/* Full-width status tabs — above split pane, like Gmail's category tabs */}
      <div className="sp-email-status-bar">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={`sp-email-status-tab${statusFilter === s ? " active" : ""}`}
            onClick={() => { setStatusFilter(s); setSearchQuery(""); }}
          >
            {STATUS_FILTER_LABELS[s] ?? s}
            {s === "conversations" && unreadConversations > 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 16, height: 16, borderRadius: "50%",
                background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700,
              }}>
                {unreadConversations > 9 ? "9+" : unreadConversations}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Split pane — flex row, fills remaining height */}
      <div
        data-tour="outreach-messages"
        style={{
          flex: "1 1 0px",
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          border: "1px solid var(--sp-line)",
          borderRadius: "var(--sp-radius-lg)",
          overflow: "hidden",
          background: "var(--sp-bg-paper)",
          margin: "0 28px 0",
        }}
      >
        {/* LEFT: filter header + scrollable list */}
        <div style={{
          width: 340,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--sp-line)",
          overflow: "hidden",
        }}>

          {/* Filter header — step chips + category + search */}
          <div style={{
            flexShrink: 0,
            padding: "8px 10px",
            borderBottom: "1px solid var(--sp-line)",
            background: "var(--sp-bg-paper)",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {[
                { value: "all", label: "All" },
                { value: "initial", label: "Init" },
                { value: "followup1", label: "FF1" },
                { value: "followup2", label: "FF2" },
                { value: "followup3", label: "FF3" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  className={`sp-email-filter-step${stepFilter === value ? " active" : ""}`}
                  onClick={() => setStepFilter(value)}
                >
                  {label}
                </button>
              ))}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ marginLeft: "auto", fontSize: 11, border: "1px solid var(--sp-line-strong)", background: "var(--sp-bg-sunken)", color: "var(--sp-ink)", borderRadius: 4, padding: "2px 4px", outline: "none", maxWidth: 80 }}
              >
                <option value="">All cat.</option>
                {dynamicCategoryOptions.map(({ value, label, count }) => (
                  <option key={value} value={value}>{label} ({count})</option>
                ))}
              </select>
            </div>
            <div className="sp-email-filter-search">
              <Search style={{ width: 12, height: 12, flexShrink: 0 }} />
              <input
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Scrollable email list */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {isLoading ? (
              <div className="p-3 space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : allMessages.length === 0 && (statusFilter !== "conversations" || !conversationThreads?.length) ? (
              <div className="p-8 text-center" style={{ color: "var(--sp-ink-3)" }}>
                <FileText style={{ width: 28, height: 28, margin: "0 auto 8px", opacity: 0.3 }} />
                <p style={{ fontSize: 12 }}>No messages in this view.</p>
              </div>
            ) : statusFilter === "conversations" ? (
              (conversationThreads ?? []).map(({ leadId, businessName, messages: msgs }) => (
                <div
                  key={leadId}
                  className={`sp-email-item${selectedLeadId === leadId || (!selectedLeadId && conversationThreads?.[0]?.leadId === leadId) ? " selected" : ""}`}
                  onClick={() => { setSelectedLeadId(leadId); markLeadRead(leadId); }}
                >
                  <div className="sp-email-item-top">
                    <span className="sp-email-item-recip">{businessName}</span>
                    {unreadByLead.get(leadId) ? (
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                        {unreadByLead.get(leadId)}
                      </span>
                    ) : (
                      <span className="sp-email-item-time">{msgs.length} msg</span>
                    )}
                  </div>
                  <div className="sp-email-item-prev">
                    {msgs[0]?.subject || msgs[0]?.content?.split("\n").filter(Boolean)[0]}
                  </div>
                </div>
              ))
            ) : (
              allMessages.map((msg) => {
                const isSelected = msg.id === (selectedMessage?.id ?? allMessages[0]?.id);
                return (
                  <div
                    key={msg.id}
                    className={`sp-email-item${isSelected ? " selected" : ""}`}
                    onClick={() => setSelectedMessageId(msg.id)}
                  >
                    <div className="sp-email-item-top">
                      <span className="sp-email-item-recip">{msg.business_name}</span>
                      <span
                        className="sp-email-item-time"
                        style={{
                          color: msg.status === "approved" ? "var(--sp-good)"
                            : msg.status === "sent" ? "var(--sp-accent)"
                            : msg.status === "rejected" ? "var(--sp-bad)"
                            : "var(--sp-warn)",
                        }}
                      >
                        {msg.status}
                      </span>
                    </div>
                    {msg.subject && <div className="sp-email-item-subj">{msg.subject}</div>}
                    <div className="sp-email-item-prev">
                      {msg.content?.split("\n").filter(Boolean)[0]}
                    </div>
                  </div>
                );
              })
            )}
          </div>{/* end scrollable list */}
        </div>{/* end left panel */}

        {/* RIGHT: email detail — scrolls independently */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          {statusFilter === "conversations" ? (
            selectedThread ? (
              <ThreadCard
                leadId={selectedThread.leadId}
                businessName={selectedThread.businessName}
                messages={selectedThread.messages}
                unreadReplies={unreadByLead.get(selectedThread.leadId) ?? 0}
                onOpen={() => markLeadRead(selectedThread.leadId)}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--sp-ink-4)", fontSize: 13 }}>
                Select a conversation
              </div>
            )
          ) : selectedMessage ? (
            <MessageCard
              key={selectedMessage.id}
              message={selectedMessage}
              emailCapReached={emailCapReached}
              isDuplicate={duplicateIds.has(selectedMessage.id)}
              defaultExpanded
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--sp-ink-4)", fontSize: 13 }}>
              Select a message
            </div>
          )}
        </div>{/* end right panel */}

      </div>{/* end split pane */}
    </div>
  );
}
