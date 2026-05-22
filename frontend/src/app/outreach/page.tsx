"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Users,
  TrendingUp,
  Target,
  Sparkles,
  Mail,
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
import { useLeads } from "@/hooks/use-leads";
import { useOutreachPlan } from "@/hooks/use-outreach-plan";
import { getOutreachMessages } from "@/lib/firestore-api";
import { EditReflectionBanner } from "@/components/edit-reflection-banner";
import { ThreadCard } from "@/components/thread-card";
import { LeadDetailDialog } from "@/components/lead-detail-dialog";
import { ActionableLeadCard } from "@/components/actionable-lead-card";
import { toast } from "sonner";
import { useReplyNotifications } from "@/hooks/use-notifications";
import type { Lead, OutreachMessage } from "@/lib/types";
import type { OutreachLead } from "@/hooks/use-outreach-plan";

const STATUS_FILTERS = ["draft", "approved", "scheduled", "sent", "conversations", "rejected", "follow-ups", "clients", "all"] as const;

function stageFor(lead: Lead): "new" | "contacted" | "replied" | "converted" | "rejected" {
  if (lead.outcome === "converted") return "converted";
  if (lead.outcome === "lost" || lead.outcome === "not_interested") return "rejected";
  if ((lead.reply_count ?? 0) > 0) return "replied";
  if (lead.stage === "contacted" || (lead.open_count ?? 0) > 0) return "contacted";
  return "new";
}

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
  const [mainTab, setMainTab] = useState<"overview" | "messages">("overview");
  const [statusFilter, setStatusFilter] = useState<string>(
    STATUS_FILTERS.includes(initialTab as any) ? initialTab! : "draft"
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [fitFilter, setFitFilter] = useState<string>("");
  const [stepFilter, setStepFilter] = useState<string>("all");
  const [showSendWarning, setShowSendWarning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 200);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [clientsViewAll, setClientsViewAll] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadFilter, setLeadFilter] = useState<string | null>(null);
  const [actionPendingLead, setActionPendingLead] = useState<string | null>(null);
  const [overviewVenueFilter, setOverviewVenueFilter] = useState<string>("");

  const isThreadView = statusFilter === "conversations" || (statusFilter === "clients" && !clientsViewAll);

  // Member auto-scopes to own messages
  const assignedTo = isMember ? user?.uid : undefined;

  // "conversations", "follow-ups", "clients", "scheduled" are client-side filters — fetch all and filter below
  const firestoreFilter = statusFilter === "all" || statusFilter === "conversations" || statusFilter === "follow-ups" || statusFilter === "clients" || statusFilter === "scheduled"
    ? { assignedTo } as any
    : { status: statusFilter, assignedTo };

  // Universal fetch for stat cards — always all messages regardless of current tab
  const { data: universalApiMessages } = useMessages({ assignedTo } as any, 1000);

  // Use API-backed messages by default, but when viewing Inbox, Follow-ups, Clients, or Scheduled,
  // fetch directly from Firestore client to avoid server-side cache delays + the default 200-row
  // dilution that hides older replied messages behind newer drafts.
  const { data: apiMessages, isLoading: apiLoading } = useMessages(firestoreFilter);
  const useClientSide = statusFilter === "conversations" || statusFilter === "follow-ups" || statusFilter === "clients" || statusFilter === "scheduled";
  const { data: clientSideMessages, isLoading: clientSideLoading } = useQuery({
    queryKey: ["outreach", "messages", "clientSide", statusFilter, assignedTo],
    queryFn: () => {
      if (statusFilter === "conversations") {
        return getOutreachMessages({ has_reply: true, assignedTo, limit: 1000 });
      }
      return getOutreachMessages({ limit: 1000, assignedTo });
    },
    enabled: useClientSide,
  });

  const rawMessages = useClientSide ? (clientSideMessages ?? []) : (apiMessages ?? []);
  const messages = useMemo(
    () => rawMessages.filter((m) => m.channel !== "instagram_dm"),
    [rawMessages]
  );
  const isLoading = useClientSide ? clientSideLoading : apiLoading;

  const { data: allLeads = [] } = useLeads();
  const { data: outreachPlan } = useOutreachPlan(10);
  const leadMap = useMemo(() => {
    const m = new Map<string, typeof allLeads[0]>();
    allLeads.forEach((l) => m.set(l.id, l));
    return m;
  }, [allLeads]);

  const hotLeads = useMemo(() =>
    [...allLeads]
      .filter((l) => {
        if (stageFor(l) !== "new" || (l.score ?? 0) < 7) return false;
        if (overviewVenueFilter && l.venue_category !== overviewVenueFilter) return false;
        return true;
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10),
    [allLeads, overviewVenueFilter]
  );

  const { replies: inboundReplies, readMap, markLeadRead } = useReplyNotifications();

  // Count unread replies per lead using per-lead read timestamps
  const unreadByLead = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of inboundReplies) {
      if (!r.lead_id) continue;
      const leadReadAt = readMap[r.lead_id];
      if (leadReadAt && r.created_at <= leadReadAt) continue;
      map.set(r.lead_id, (map.get(r.lead_id) ?? 0) + 1);
    }
    return map;
  }, [inboundReplies, readMap]);

  // Only count leads that are actually visible as conversation threads
  const unreadConversations = useMemo(() => {
    const visibleLeadIds = new Set(
      (universalApiMessages ?? []).filter((m) => m.has_reply && !m.is_client_campaign).map((m) => m.lead_id)
    );
    return [...unreadByLead.entries()]
      .filter(([leadId, count]) => count > 0 && visibleLeadIds.has(leadId))
      .length;
  }, [unreadByLead, universalApiMessages]);

  const generateMutation = useGenerateDrafts();
  const regenerateAllMutation = useRegenerateAll();
  const batchApproveMutation = useBatchApprove();
  const sendMutation = useSendApproved();
  const followupsMutation = useGenerateFollowups();

  const universalMessages = (universalApiMessages ?? []).filter((m) => !m.is_client_campaign && m.channel !== "instagram_dm");

  // Build set of lead_ids that have a sent step 1 message (from universal data, not tab-filtered)
  const leadsWithSentEmail = useMemo(() => new Set(
    universalMessages
      .filter((m) => m.step_number === 1 && m.status === "sent")
      .map((m) => m.lead_id)
  ), [universalMessages]);

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
        ? (messages ?? []).filter((m) => m.is_client_campaign && (clientsViewAll || m.has_reply))
        : statusFilter === "scheduled"
          ? (messages ?? []).filter((m) => m.status === "approved" && !!m.scheduled_send_date && !m.is_client_campaign)
          : (statusFilter === "all")
            ? (messages ?? []).filter((m) => !m.is_client_campaign)
            : (messages ?? []).filter((m) => m.status === statusFilter && !m.is_client_campaign);
  const filteredByCategory = filteredByStatus.filter(
    (m) => !categoryFilter || m.venue_category === categoryFilter
  );
  const filteredByFit = useMemo(() => {
    if (!fitFilter) return filteredByCategory;
    return filteredByCategory.filter((m) => {
      const pill = getFitPill(m.lead_id);
      if (fitFilter === "not_enriched") return pill === null;
      return pill?.label.toLowerCase().replace(" ", "_") === fitFilter;
    });
  }, [filteredByCategory, fitFilter, leadMap]);

  const filteredByStep = useMemo(() => {
    if (stepFilter === "all") return filteredByFit;
    const step = stepFilter === "initial" ? 1 : stepFilter === "followup1" ? 2 : stepFilter === "followup2" ? 3 : 4;
    return filteredByFit.filter((m) => (m.step_number ?? 1) === step);
  }, [filteredByFit, stepFilter]);

  const allMessages = useMemo(() => {
    let result = filteredByStep;
    if (leadFilter) {
      result = result.filter((m) => m.lead_id === leadFilter);
    }
    if (statusFilter === "draft" && outreachPlan) {
      const priorityMap = new Map<string, number>();
      outreachPlan.recommended.forEach((l, i) => priorityMap.set(l.lead_id, i));
      if (priorityMap.size > 0) {
        result = [...result].sort((a, b) => {
          const aRank = priorityMap.get(a.lead_id) ?? Infinity;
          const bRank = priorityMap.get(b.lead_id) ?? Infinity;
          return aRank - bRank;
        });
      }
    }
    if (!debouncedSearchQuery.trim()) return result;
    const q = debouncedSearchQuery.toLowerCase();
    return result.filter(
      (m) =>
        m.business_name?.toLowerCase().includes(q) ||
        m.contact_name?.toLowerCase().includes(q) ||
        m.recipient_email?.toLowerCase().includes(q) ||
        m.subject?.toLowerCase().includes(q) ||
        m.content?.toLowerCase().includes(q)
    );
  }, [filteredByStep, debouncedSearchQuery, leadFilter, statusFilter, outreachPlan]);
  function getFitPill(leadId: string): { label: string; color: string } | null {
    const lead = leadMap.get(leadId);
    if (!lead) return null;
    const score = lead.score ?? null;
    const menuFit = lead.menu_fit ?? null;
    if (score === null && menuFit === null) return null;
    if (score !== null && score >= 8 || menuFit === "strong") return { label: "Strong fit", color: "#22c55e" };
    if (score !== null && score >= 6 || menuFit === "good") return { label: "Good fit", color: "#f59e0b" };
    return { label: "Weak fit", color: "#ef4444" };
  }

  const { data: approvedEmailCount = 0 } = useApprovedEmailCount();
  const emailCapReached = approvedEmailCount >= 20;


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

  const draftCount = universalMessages.filter((m) => m.status === "draft").length;
  const approvedCount = universalMessages.filter((m) => m.status === "approved").length;
  const sentCount = universalMessages.filter((m) => m.status === "sent").length;
  const repliedCount = universalMessages.filter((m) => m.has_reply).length;

  const startOfWeek = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
    return d.toISOString();
  }, []);

  const sentThisWeek = universalMessages.filter(
    (m) => m.status === "sent" && m.sent_at && m.sent_at >= startOfWeek
  ).length;

  const followupsPending = universalMessages.filter(
    (m) => (m.step_number ?? 1) > 1 && ["draft", "approved"].includes(m.status ?? "") && leadsWithSentEmail.has(m.lead_id)
  ).length;

  const scheduledCount = universalMessages.filter(
    (m) => m.status === "approved" && !!m.scheduled_send_date && !m.is_client_campaign
  ).length;

  // Filtered stats for Messages tab — reflect venue/fit selection
  const filteredLeadIds = useMemo(() => {
    if (!categoryFilter && !fitFilter) return null;
    return new Set(
      allLeads
        .filter((l) => {
          if (categoryFilter && l.venue_category !== categoryFilter) return false;
          if (fitFilter) {
            const pill = getFitPill(l.id);
            if (fitFilter === "not_enriched") return pill === null;
            if (pill?.label.toLowerCase().replace(" ", "_") !== fitFilter) return false;
          }
          return true;
        })
        .map((l) => l.id)
    );
  }, [allLeads, categoryFilter, fitFilter]);

  const filteredUniversalMessages = useMemo(() => {
    if (!filteredLeadIds) return universalMessages;
    return universalMessages.filter((m) => filteredLeadIds.has(m.lead_id));
  }, [universalMessages, filteredLeadIds]);

  const filteredLeadsWithSentEmail = useMemo(() => {
    if (!filteredLeadIds) return leadsWithSentEmail;
    return new Set(
      [...leadsWithSentEmail].filter((id) => filteredLeadIds.has(id))
    );
  }, [leadsWithSentEmail, filteredLeadIds]);

  const msgDraftCount = filteredUniversalMessages.filter((m) => m.status === "draft").length;
  const msgApprovedCount = filteredUniversalMessages.filter((m) => m.status === "approved").length;
  const msgSentCount = filteredUniversalMessages.filter((m) => m.status === "sent").length;
  const msgRepliedCount = filteredUniversalMessages.filter((m) => m.has_reply).length;
  const msgSentThisWeek = filteredUniversalMessages.filter(
    (m) => m.status === "sent" && m.sent_at && m.sent_at >= startOfWeek
  ).length;
  const msgFollowupsPending = filteredUniversalMessages.filter(
    (m) => (m.step_number ?? 1) > 1 && ["draft", "approved"].includes(m.status ?? "") && filteredLeadsWithSentEmail.has(m.lead_id)
  ).length;
  const msgScheduledCount = filteredUniversalMessages.filter(
    (m) => m.status === "approved" && !!m.scheduled_send_date && !m.is_client_campaign
  ).length;

  const conversionRate = useMemo(() => {
    const contacted = allLeads.filter((l) => l.stage && l.stage !== "scraped").length;
    const converted = allLeads.filter((l) => l.outcome === "converted").length;
    if (!contacted) return 0;
    return Math.round((converted / contacted) * 100);
  }, [allLeads]);

  const venueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allLeads.forEach((l) => {
      if (l.venue_category) counts.set(l.venue_category, (counts.get(l.venue_category) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([value, count]) => ({
        value,
        count,
        label: CATEGORY_OPTIONS.find((o) => o.value === value)?.label
          ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
  }, [allLeads]);
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
    if (!isThreadView) return null;
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
  }, [allMessages, isThreadView]);

  const selectedMessage = allMessages.find((m) => m.id === selectedMessageId) ?? allMessages[0] ?? null;
  const selectedThread = conversationThreads?.find((t) => t.leadId === selectedLeadId) ?? conversationThreads?.[0] ?? null;

  useEffect(() => {
    setSelectedMessageId(allMessages[0]?.id ?? null);
    setSelectedLeadId(conversationThreads?.[0]?.leadId ?? null);
  }, [statusFilter, categoryFilter, stepFilter, debouncedSearchQuery, clientsViewAll, leadFilter]);

  // Auto-mark the active conversation thread as read whenever it changes
  useEffect(() => {
    if (statusFilter === "conversations" && selectedThread?.leadId) {
      markLeadRead(selectedThread.leadId);
    }
  }, [selectedThread?.leadId, statusFilter]);

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

  function handleEmailLead(lead: Lead) {
    setSelectedLead(null);
    setLeadFilter(lead.id);
    setMainTab("messages");
    setStatusFilter("draft");
    setCategoryFilter("");
    setFitFilter("");
  }

  // Determine action for each recommended lead
  const actionableLeads = useMemo(() => {
    if (!outreachPlan?.recommended.length) return [];
    const msgMap = new Map<string, OutreachMessage>();
    for (const m of universalApiMessages ?? []) {
      if (!msgMap.has(m.lead_id)) msgMap.set(m.lead_id, m);
    }
    const results: { lead: OutreachLead; action: "generate" | "send" | "contacted"; messageId?: string }[] = [];
    for (const lead of outreachPlan.recommended) {
      if (overviewVenueFilter && lead.venue_category !== overviewVenueFilter) continue;
      const msg = msgMap.get(lead.lead_id);
      if (!msg) {
        results.push({ lead, action: "generate" });
      } else if (msg.status === "draft" || msg.status === "approved") {
        results.push({ lead, action: "send", messageId: msg.id });
      } else {
        results.push({ lead, action: "contacted" });
      }
    }
    return results.slice(0, 10);
  }, [outreachPlan, universalApiMessages, overviewVenueFilter]);

  // Actionable hot leads
  const actionableHotLeads = useMemo(() => {
    const msgMap = new Map<string, OutreachMessage>();
    for (const m of universalApiMessages ?? []) {
      if (!msgMap.has(m.lead_id)) msgMap.set(m.lead_id, m);
    }
    const results: { lead: Lead; action: "generate" | "send" | "contacted"; messageId?: string }[] = [];
    for (const lead of hotLeads) {
      const msg = msgMap.get(lead.id);
      if (!msg) {
        results.push({ lead, action: "generate" });
      } else if (msg.status === "draft" || msg.status === "approved") {
        results.push({ lead, action: "send", messageId: msg.id });
      } else {
        results.push({ lead, action: "contacted" });
      }
    }
    return results.slice(0, 10);
  }, [hotLeads, universalApiMessages]);

  function handleHotLeadAction(lead: Lead, action: "generate" | "send", messageId?: string) {
    setActionPendingLead(lead.id);
    setSelectedLead(null);
    setLeadFilter(lead.id);
    setMainTab("messages");
    if (action === "generate") {
      setStatusFilter("draft");
      generateMutation.mutate([lead.id], {
        onSettled: () => setActionPendingLead(null),
      });
    } else {
      const msg = universalApiMessages?.find(m => m.id === messageId);
      setStatusFilter(msg?.status === "approved" ? "approved" : "draft");
      setActionPendingLead(null);
    }
  }

  function handleAction(lead: OutreachLead, action: "generate" | "send", messageId?: string) {
    setActionPendingLead(lead.lead_id);
    setSelectedLead(null);
    setLeadFilter(lead.lead_id);
    setMainTab("messages");
    if (action === "generate") {
      setStatusFilter("draft");
      generateMutation.mutate([lead.lead_id], {
        onSettled: () => setActionPendingLead(null),
      });
    } else {
      const msg = universalApiMessages?.find(m => m.id === messageId);
      setStatusFilter(msg?.status === "approved" ? "approved" : "draft");
      setActionPendingLead(null);
    }
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
      {/* Top-level tab bar */}
      <div style={{ display: "flex", gap: 0, padding: "8px 28px 0", borderBottom: "1px solid var(--sp-line)" }}>
        {(["overview", "messages"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMainTab(tab)}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: mainTab === tab ? 600 : 400,
              color: mainTab === tab ? "var(--sp-ink)" : "var(--sp-ink-3)",
              borderBottom: mainTab === tab ? "2px solid var(--sp-accent)" : "2px solid transparent",
              background: "none",
              borderLeft: "none",
              borderRight: "none",
              borderTop: "none",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {mainTab === "overview" ? (
        /* ===== TAB 1: OVERVIEW ===== */
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 28px" }}>
          {/* Stat cards — global, not venue-filtered */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            {[
              { label: "Drafted", value: draftCount },
              { label: "Sent this week", value: sentThisWeek },
              { label: "Replied", value: repliedCount },
              { label: "Follow-ups", value: followupsPending },
              { label: "Scheduled", value: scheduledCount },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: "var(--sp-bg-sunken)",
                border: "1px solid var(--sp-line)",
                borderRadius: 10,
                padding: "12px 20px",
                minWidth: 100,
                textAlign: "center",
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: "var(--sp-ink)", lineHeight: 1.2 }}>{value}</div>
                <div style={{ fontSize: 11, color: "var(--sp-ink-3)", marginTop: 4, whiteSpace: "nowrap" }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Weekly target */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 4, marginBottom: 16, maxWidth: 280 }}>
            <div style={{ fontSize: 11, color: "var(--sp-ink-3)" }}>Weekly target</div>
            <div style={{ height: 8, borderRadius: 4, background: "var(--sp-line-strong)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "var(--sp-accent)", width: `${Math.min(100, Math.round((sentThisWeek / 100) * 100))}%`, transition: "width 0.3s" }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--sp-ink-3)" }}>{sentThisWeek} / 100</div>
          </div>

          {/* Venue filter for Overview */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <label style={{ fontSize: 11, color: "var(--sp-ink-3)", whiteSpace: "nowrap" }}>Venue</label>
            <select
              value={overviewVenueFilter}
              onChange={(e) => setOverviewVenueFilter(e.target.value)}
              style={{
                fontSize: 12, padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                border: "1px solid var(--sp-line-strong)",
                background: "var(--sp-bg-sunken)",
                color: "var(--sp-ink-2)",
                minWidth: 180,
              }}
            >
              <option value="">All venues</option>
              {venueCounts.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Top 10 Eligible Leads */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Sparkles className="h-4 w-4 text-purple-400" />
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--sp-ink)" }}>Top 10 Eligible Leads</h2>
              <span style={{ fontSize: 11, color: "var(--sp-ink-3)" }}>
                {outreachPlan?.total_eligible ? `${outreachPlan.total_eligible} total eligible` : ""}
              </span>
            </div>
            {!outreachPlan ? (
              <div className="p-3 space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : actionableLeads.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--sp-ink-3)" }}>No eligible leads for outreach. Scrape and enrich leads first.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {actionableLeads.map(({ lead, action, messageId }, i) => (
                  <ActionableLeadCard
                    key={lead.lead_id}
                    lead={lead}
                    rank={i + 1}
                    action={action}
                    messageId={messageId}
                    onAction={handleAction}
                    onLeadClick={(l) => {
                      const fullLead = allLeads.find((x) => x.id === l.lead_id);
                      if (fullLead) setSelectedLead(fullLead);
                    }}
                    isPending={actionPendingLead === lead.lead_id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Hot New Leads */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Target className="h-4 w-4 text-amber-400" />
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--sp-ink)" }}>Hot New Leads</h2>
              <span style={{ fontSize: 11, color: "var(--sp-ink-3)" }}>Score ≥ 7 · awaiting first contact</span>
            </div>
            {actionableHotLeads.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--sp-ink-3)" }}>No high-score new leads yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {actionableHotLeads.map(({ lead, action, messageId }, i) => (
                  <div key={lead.id} className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/10 p-3 transition-colors hover:bg-muted/20">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[11px] font-bold text-amber-500">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1 cursor-pointer" onClick={() => setSelectedLead(lead)}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{lead.business_name}</span>
                        <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                          {lead.venue_category?.replace(/_/g, " ") ?? "—"}
                        </Badge>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "1px 6px", borderRadius: 9999, fontSize: 10, fontWeight: 600,
                          background: (lead.score ?? 0) >= 8 ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                          color: (lead.score ?? 0) >= 8 ? "#22c55e" : "#f59e0b",
                        }}>
                          {lead.score ?? 0}
                        </span>
                      </div>
                      {lead.location_postcode && (
                        <p className="text-[10px] text-muted-foreground">{lead.location_postcode}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {lead.assigned_to_name ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: "50%",
                            background: "var(--sp-line-strong)", display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 8, fontWeight: 600, color: "var(--sp-ink-2)",
                          }}>
                            {lead.assigned_to_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[10px] text-muted-foreground">{lead.assigned_to_name}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-zinc-500">Unassigned</span>
                      )}
                      {action === "contacted" ? (
                        <span className="text-[10px] text-muted-foreground px-2 py-1">Contacted</span>
                      ) : (
                        <Button
                          size="sm"
                          variant={action === "generate" ? "default" : "outline"}
                          className={`h-7 text-[11px] px-2 shrink-0 ${
                            action === "generate"
                              ? "bg-primary hover:bg-primary/90"
                              : "border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                          }`}
                          disabled={actionPendingLead === lead.id}
                          onClick={(e) => { e.stopPropagation(); handleHotLeadAction(lead, action as "generate" | "send", messageId); }}
                        >
                          {actionPendingLead === lead.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : action === "generate" ? (
                            <>
                              <FileText className="h-3 w-3 mr-1" />
                              Generate Draft
                            </>
                          ) : (
                            <>
                              <Send className="h-3 w-3 mr-1" />
                              Send Email
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ===== TAB 2: MESSAGES ===== */
        <>
          {/* Page head */}
          <div className="sp-page-head" style={{ margin: 0, padding: "16px 28px 8px", flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h1 className="sp-page-title">Outreach</h1>
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
              {msgDraftCount > 0 && (
                <Button
                  variant="outline"
                  className="border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                  onClick={handleApproveAll}
                  disabled={batchApproveMutation.isPending || emailCapReached}
                >
                  <CheckCheck className="mr-1.5 h-4 w-4" />
                  Approve All ({msgDraftCount})
                </Button>
              )}
              {(isAdmin || isMember) && msgApprovedCount > 0 && (
                <Button
                  variant="outline"
                  className="border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                  onClick={() => handleSend(false)}
                  disabled={sendMutation.isPending}
                >
                  {sendMutation.isPending
                    ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    : <Send className="mr-1.5 h-4 w-4" />}
                  Send Approved ({msgApprovedCount})
                </Button>
              )}
              </div>
            </div>

            {/* Stat cards — venue/fit filtered */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { label: "Drafted", value: msgDraftCount },
                { label: "Sent this week", value: msgSentThisWeek },
                { label: "Replied", value: msgRepliedCount },
                { label: "Follow-ups", value: msgFollowupsPending },
                { label: "Scheduled", value: msgScheduledCount },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  background: "var(--sp-bg-sunken)",
                  border: "1px solid var(--sp-line)",
                  borderRadius: 10,
                  padding: "12px 20px",
                  minWidth: 100,
                  textAlign: "center",
                  flexShrink: 0,
                }}>
                  <div style={{ fontSize: 22, fontWeight: 600, color: "var(--sp-ink)", lineHeight: 1.2 }}>{value}</div>
                  <div style={{ fontSize: 11, color: "var(--sp-ink-3)", marginTop: 4, whiteSpace: "nowrap" }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Venue + Fit filters */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 11, color: "var(--sp-ink-3)", whiteSpace: "nowrap" }}>Venue</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{
                    fontSize: 12, padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                    border: "1px solid var(--sp-line-strong)",
                    background: "var(--sp-bg-sunken)",
                    color: "var(--sp-ink-2)",
                    minWidth: 180,
                  }}
                >
                  <option value="">All venues</option>
                  {venueCounts.map(({ value, label, count }) => (
                    <option key={value} value={value}>{label} ({count})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 11, color: "var(--sp-ink-3)", whiteSpace: "nowrap" }}>Fit</label>
                <select
                  value={fitFilter}
                  onChange={(e) => setFitFilter(e.target.value)}
                  style={{
                    fontSize: 12, padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                    border: `1px solid ${fitFilter ? "var(--sp-accent)" : "var(--sp-line-strong)"}`,
                    background: "var(--sp-bg-sunken)",
                    color: fitFilter ? "var(--sp-accent)" : "var(--sp-ink-2)",
                    minWidth: 140,
                  }}
                >
                  <option value="">All fits</option>
                  <option value="strong_fit">Strong fit</option>
                  <option value="good_fit">Good fit</option>
                  <option value="weak_fit">Weak fit</option>
                  <option value="not_enriched">Not enriched</option>
                </select>
              </div>
              {leadFilter && (() => {
                const lead = allLeads.find((l) => l.id === leadFilter);
                return lead ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label style={{ fontSize: 11, color: "var(--sp-ink-3)", whiteSpace: "nowrap" }}>Lead</label>
                    <span style={{
                      fontSize: 12, padding: "4px 10px", borderRadius: 6,
                      background: "var(--sp-accent)", color: "#fff", fontWeight: 500,
                    }}>
                      {lead.business_name}
                    </span>
                    <button
                      onClick={() => setLeadFilter(null)}
                      style={{
                        fontSize: 11, color: "var(--sp-ink-3)", cursor: "pointer",
                        background: "none", border: "none", padding: 0,
                      }}
                    >
                      Clear
                    </button>
                  </div>
                ) : null;
              })()}
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
                </div>
                <div className="sp-email-filter-search">
                  <Search style={{ width: 12, height: 12, flexShrink: 0 }} />
                  <input
                    placeholder="Search…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                {statusFilter === "clients" && (
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button
                      className={`sp-email-filter-step${!clientsViewAll ? " active" : ""}`}
                      onClick={() => setClientsViewAll(false)}
                    >
                      Conversations
                    </button>
                    <button
                      className={`sp-email-filter-step${clientsViewAll ? " active" : ""}`}
                      onClick={() => setClientsViewAll(true)}
                    >
                      All messages
                    </button>
                  </div>
                )}
              </div>

              {/* Scrollable email list */}
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {isLoading ? (
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : allMessages.length === 0 && (!isThreadView || !conversationThreads?.length) ? (
                  <div className="p-8 text-center" style={{ color: "var(--sp-ink-3)" }}>
                    <FileText style={{ width: 28, height: 28, margin: "0 auto 8px", opacity: 0.3 }} />
                    <p style={{ fontSize: 12 }}>No messages in this view.</p>
                  </div>
                ) : isThreadView ? (
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
                        {(() => {
                          const fit = getFitPill(msg.lead_id);
                          return fit ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: fit.color, flexShrink: 0, display: "inline-block" }} />
                              <span style={{ fontSize: 10, color: fit.color, fontWeight: 500 }}>{fit.label}</span>
                            </div>
                          ) : null;
                        })()}
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
              {isThreadView ? (
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
                  fitLabel={getFitPill(selectedMessage.lead_id)?.label}
                  fitColor={getFitPill(selectedMessage.lead_id)?.color}
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--sp-ink-4)", fontSize: 13 }}>
                  Select a message
                </div>
              )}
            </div>{/* end right panel */}

          </div>{/* end split pane */}
        </>
      )}

      {/* Lead Detail Dialog */}
      <LeadDetailDialog
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onEmail={selectedLead ? handleEmailLead : undefined}
      />
    </div>
  );
}
