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
  useBulkUnapprove,
  useSendApproved,
  useGenerateFollowups,
  useApprovedEmailCount,
} from "@/hooks/use-outreach";
import { BulkConfirmDialog } from "@/components/bulk-confirm-dialog";
import { ListRail } from "@/components/outreach-list-rail";
import { useLeads } from "@/hooks/use-leads";
import { useOutreachPlan } from "@/hooks/use-outreach-plan";
import { getOutreachMessages, watchRecentReplies } from "@/lib/firestore-api";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { EditReflectionBanner } from "@/components/edit-reflection-banner";
import { ThreadCard } from "@/components/thread-card";
import { LeadDetailDialog } from "@/components/lead-detail-dialog";
import { ActionableLeadCard } from "@/components/actionable-lead-card";
import { toast } from "sonner";
import { useReplyNotifications } from "@/hooks/use-notifications";
import type { Lead, OutreachMessage } from "@/lib/types";
import type { OutreachLead } from "@/hooks/use-outreach-plan";

// In-page tab strip. Note: "conversations" is intentionally absent — Inbox
// is now its own sidebar destination at /inbox (which renders this same
// component with forcedTab="conversations" and hideTabStrip). The state
// machinery still handles "conversations" as a statusFilter value because
// the /inbox route relies on it; we just don't surface it as a tab here.
const STATUS_FILTERS = ["draft", "approved", "scheduled", "sent", "rejected", "follow-ups", "clients", "all"] as const;
const ALL_STATUS_FILTERS = [...STATUS_FILTERS, "conversations"] as const;

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

function formatVenueLabel(value: string | null | undefined): string {
  if (!value) return "";
  return CATEGORY_OPTIONS.find((o) => o.value === value)?.label
    ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface OutreachViewProps {
  /** When set, overrides the URL ?tab=... param. Used by /inbox to force the
   *  conversations view. */
  forcedTab?: string;
  /** Hide the in-page status tab strip. Used by /inbox so the page reads as
   *  a single-purpose destination, not a sub-tab of Outreach. */
  hideTabStrip?: boolean;
  /** Replace the H1 ("Outreach" → "Inbox"). */
  titleOverride?: string;
  /** Default to "messages" main-tab when /inbox skips the overview. */
  initialMainTab?: "overview" | "messages";
  /** Hide the Overview/Messages main tab strip entirely. Used by /inbox so
   *  the page reads as a single dedicated destination — Gmail-style — and
   *  doesn't look like a tab inside Outreach. */
  hideMainTabs?: boolean;
  /** Inbox-style minimal header: hides the Generate/Regenerate/Approve action
   *  buttons (irrelevant for inbox), the Drafted/Sent/Replied/Follow-ups/
   *  Scheduled stat counters, and the Focus Mode discovery strip. Venue/Fit
   *  filters are preserved so the operator can still narrow conversations. */
  simplifiedHeader?: boolean;
  /** When set, the in-page status tab strip renders only this subset of tabs
   *  (in this order) instead of the full STATUS_FILTERS list. Used by /review
   *  to show only Draft + Approved so the operator can spot-check approved
   *  drafts before they go out, without exposing Sent / Inbox / Rejected on
   *  the daily review page. Ignored when hideTabStrip is true. */
  allowedStatusTabs?: readonly string[];
}

export function OutreachView(props: OutreachViewProps = {}) {
  const { forcedTab, hideTabStrip, titleOverride, initialMainTab, hideMainTabs, simplifiedHeader, allowedStatusTabs } = props;
  const { isAdmin, isMember, user } = useAuth();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initialTab = forcedTab ?? urlTab;
  const [mainTab, setMainTab] = useState<"overview" | "messages">(
    initialMainTab ?? "overview",
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    ALL_STATUS_FILTERS.includes(initialTab as any) ? initialTab! : "draft"
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
  // Inbox-only filter: narrows the conversation list by triage outcome.
  // "pending" = no outcome yet (operator hasn't triaged it).
  const [inboxOutcomeFilter, setInboxOutcomeFilter] = useState<
    "all" | "pending" | "interested" | "not_interested" | "snoozed"
  >("all");

  // Generate-drafts progress state. We capture the start timestamp + expected
  // total when the operator hits Generate; a Firestore listener then counts
  // every new draft doc whose created_at >= startedAt so the button can show
  // "Generating 5/20" live as drafts land. After the mutation settles the
  // captured IDs power a "Just generated" filter the operator can flip on to
  // review only the new batch.
  const [generationStartedAt, setGenerationStartedAt] = useState<string | null>(null);
  const [generationExpectedTotal, setGenerationExpectedTotal] = useState<number>(0);
  const [newDraftIds, setNewDraftIds] = useState<Set<string>>(new Set());
  const [focusJustGenerated, setFocusJustGenerated] = useState<boolean>(false);

  useEffect(() => {
    if (!generationStartedAt) return;
    const q = query(
      collection(db, "outreach_messages"),
      where("status", "==", "draft"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const ids = new Set<string>();
      snap.forEach((d) => {
        const data = d.data();
        if ((data.created_at || "") >= generationStartedAt) ids.add(d.id);
      });
      setNewDraftIds(ids);
    });
    return unsub;
  }, [generationStartedAt]);

  const isThreadView = statusFilter === "conversations" || (statusFilter === "clients" && !clientsViewAll);

  // Member auto-scopes to own messages — except on the Inbox tab. Replies are
  // operational and the whole team should see every one regardless of who
  // owns the outgoing thread; otherwise unassigned replies (or replies on
  // messages assigned to another teammate) silently disappear from a member's
  // Inbox while the daily digest still counts them.
  const assignedTo = isMember && statusFilter !== "conversations" ? user?.uid : undefined;

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
  // Inbox + scheduled + follow-ups + clients views fetch progressively; bump
  // by 100 per "Load older" click. Initial 100 keeps first paint snappy and
  // bounds the work the virtualizer + ThreadCard have to do on a cold load.
  const [conversationPageSize, setConversationPageSize] = useState(100);
  const { data: clientSideMessages, isLoading: clientSideLoading } = useQuery({
    queryKey: ["outreach", "messages", "clientSide", statusFilter, assignedTo, conversationPageSize],
    queryFn: () => {
      if (statusFilter === "conversations") {
        return getOutreachMessages({ has_reply: true, assignedTo, limit: conversationPageSize });
      }
      return getOutreachMessages({ limit: conversationPageSize, assignedTo });
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

  const { replies: inboundReplies, readMap, markLeadRead, markLeadUnread } = useReplyNotifications();

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
  const bulkUnapproveMutation = useBulkUnapprove();
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
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
    // "Just generated" pin: when the operator clicks "Review them →" after a
    // generate-drafts run, narrow the queue to only that batch.
    if (focusJustGenerated && newDraftIds.size > 0) {
      result = result.filter((m) => newDraftIds.has(m.id));
    }
    if (statusFilter === "draft" && outreachPlan) {
      const priorityMap = new Map<string, number>();
      outreachPlan.recommended.forEach((l, i) => priorityMap.set(l.lead_id, i));
      if (priorityMap.size > 0) {
        result = [...result].sort((a, b) => {
          const aRank = priorityMap.get(a.lead_id) ?? Infinity;
          const bRank = priorityMap.get(b.lead_id) ?? Infinity;
          if (aRank !== bRank) return aRank - bRank;
          // Within the same priority tier, cluster by venue_category so review
          // batches stay coherent even without an explicit focus-mode filter.
          return (a.venue_category ?? "").localeCompare(b.venue_category ?? "");
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
  }, [filteredByStep, debouncedSearchQuery, leadFilter, statusFilter, outreachPlan, focusJustGenerated, newDraftIds]);
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

  // Focus Mode: when a venue category is selected, the next "Generate Drafts"
  // call produces drafts only for that category's top-N eligible leads.
  // outreachPlan.recommended is priority-ranked; pad with allLeads when shallow.
  const focusModeLeadIds = useMemo(() => {
    if (!categoryFilter) return null;
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const l of outreachPlan?.recommended ?? []) {
      if (l.venue_category !== categoryFilter) continue;
      if (seen.has(l.lead_id)) continue;
      ids.push(l.lead_id);
      seen.add(l.lead_id);
    }
    for (const l of allLeads) {
      if (l.venue_category !== categoryFilter) continue;
      if (seen.has(l.id)) continue;
      ids.push(l.id);
      seen.add(l.id);
    }
    return ids.slice(0, 20);
  }, [categoryFilter, outreachPlan, allLeads]);

  const focusCohortLabel = useMemo(() => {
    if (!categoryFilter) return null;
    return venueCounts.find((v) => v.value === categoryFilter)?.label
      ?? categoryFilter.replace(/_/g, " ");
  }, [categoryFilter, venueCounts]);
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

  // Map lead_id -> latest matched inbound reply timestamp. Used to sort the
  // Inbox by "most recent customer reply" instead of "most recent outbound
  // send" — without this, a thread we re-sent to last week appears above a
  // thread that got a fresh reply yesterday, because the sort key is on the
  // outreach_messages doc which doesn't carry the reply timestamp.
  const [latestReplyByLead, setLatestReplyByLead] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isThreadView) return;
    const unsub = watchRecentReplies((replies) => {
      const next = new Map<string, string>();
      for (const r of replies) {
        if (!r.lead_id || !r.created_at) continue;
        const prev = next.get(r.lead_id);
        if (!prev || r.created_at > prev) next.set(r.lead_id, r.created_at);
      }
      setLatestReplyByLead(next);
    }, 100);
    return unsub;
  }, [isThreadView]);

  const conversationThreads = useMemo(() => {
    if (!isThreadView) return null;
    const threads = new Map<string, { leadId: string; businessName: string; messages: typeof allMessages }>();
    for (const msg of allMessages) {
      if (!threads.has(msg.lead_id)) {
        threads.set(msg.lead_id, { leadId: msg.lead_id, businessName: msg.business_name, messages: [] });
      }
      threads.get(msg.lead_id)!.messages.push(msg);
    }
    const all = Array.from(threads.values()).sort((a, b) => {
      const latest = (leadId: string, msgs: typeof allMessages) => {
        // Reply timestamp wins when present — that's the "most recent activity"
        // the operator actually cares about. Falls back to outbound send time
        // for threads we haven't received a reply on yet (clients view, etc).
        const replyTs = latestReplyByLead.get(leadId) ?? "";
        const sendTs = msgs.reduce((m, x) => {
          const t = x.sent_at || x.created_at || "";
          return t > m ? t : m;
        }, "");
        return replyTs > sendTs ? replyTs : sendTs;
      };
      return latest(b.leadId, b.messages).localeCompare(latest(a.leadId, a.messages));
    });
    // Apply the inbox outcome filter only on the inbox view (statusFilter ===
    // "conversations"). The "clients" thread view shouldn't be affected.
    if (statusFilter !== "conversations" || inboxOutcomeFilter === "all") return all;
    return all.filter((t) => {
      const outcome = leadMap.get(t.leadId)?.outcome;
      if (inboxOutcomeFilter === "pending") return !outcome || outcome === "ongoing";
      return outcome === inboxOutcomeFilter;
    });
  }, [allMessages, isThreadView, statusFilter, inboxOutcomeFilter, leadMap]);

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
    const startedAt = new Date().toISOString();
    // Expected total: in Focus Mode it's exactly the cohort's eligible-lead
    // count; otherwise default to a typical morning batch.
    const expected = focusModeLeadIds?.length ?? 20;
    setGenerationStartedAt(startedAt);
    setGenerationExpectedTotal(expected);
    setNewDraftIds(new Set());
    setFocusJustGenerated(false);

    if (focusModeLeadIds && focusModeLeadIds.length > 0) {
      generateMutation.mutate(focusModeLeadIds);
    } else {
      generateMutation.mutate(undefined);
    }
  }

  function handleApproveAll() {
    if (draftIds.length === 0) return;
    // Snapshot the ids before the mutation so Undo can revert exactly the
    // set we just approved (filter state may have moved on by then).
    const idsToApprove = [...draftIds];
    batchApproveMutation.mutate(idsToApprove, {
      onSuccess: (data) => {
        const skipped = (data as { skipped_duplicates?: number }).skipped_duplicates ?? 0;
        const approvedCount = (data as { approved?: number }).approved ?? idsToApprove.length;
        if (skipped > 0) {
          toast.warning(
            `${skipped} draft${skipped > 1 ? "s" : ""} skipped — lead already has a live email outreach.`
          );
        }
        // Undo toast — only offered for batches small enough to revert cleanly.
        if (approvedCount > 0 && approvedCount <= 50) {
          toast.success(
            `Approved ${approvedCount} draft${approvedCount === 1 ? "" : "s"}.`,
            {
              duration: 10_000,
              action: {
                label: "Undo",
                onClick: () => {
                  bulkUnapproveMutation.mutate(idsToApprove.slice(0, approvedCount), {
                    onSuccess: ({ reverted }) => {
                      toast.info(
                        `Reverted ${reverted} draft${reverted === 1 ? "" : "s"} back to draft.`
                      );
                    },
                  });
                },
              },
            },
          );
        }
      },
    });
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
      {/* Top-level tab bar — hidden when the page is being rendered as a
          single-purpose destination (e.g. /inbox), so it doesn't look like a
          tab inside Outreach. */}
      {!hideMainTabs && (
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
      )}

      {mainTab === "overview" ? (
        /* ===== TAB 1: OVERVIEW ===== */
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 28px" }}>
          {/* Stat cards — global, not venue-filtered. Grid spreads them evenly
              across the available width so the row doesn't leave a hard gap on
              the right; collapses to 2 columns on narrow viewports. */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 16,
          }} className="outreach-stat-row">
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
                textAlign: "center",
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
              <h1 className="sp-page-title">{titleOverride ?? "Outreach"}</h1>
              {!simplifiedHeader && (
              <div data-tour="outreach-actions" className="sp-page-actions">
              <Button
                onClick={handleGenerate}
                disabled={
                  generateMutation.isPending
                  || (categoryFilter !== "" && (focusModeLeadIds?.length ?? 0) === 0)
                }
                title={
                  categoryFilter !== "" && (focusModeLeadIds?.length ?? 0) === 0
                    ? `No eligible ${focusCohortLabel ?? "leads"} in pool`
                    : undefined
                }
              >
                {generateMutation.isPending
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <FileText className="mr-1.5 h-4 w-4" />}
                {generateMutation.isPending
                  ? `Generating ${newDraftIds.size} / ${generationExpectedTotal}…`
                  : focusModeLeadIds && focusModeLeadIds.length > 0 && focusCohortLabel
                  ? `Generate ${focusModeLeadIds.length} ${focusCohortLabel} drafts`
                  : "Generate Drafts"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmRegenerateOpen(true)}
                disabled={regenerateAllMutation.isPending}
                title="Discards current drafts and re-runs Generate Drafts. Confirms first."
              >
                {regenerateAllMutation.isPending
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <RefreshCw className="mr-1.5 h-4 w-4" />}
                Regenerate All
              </Button>
              {msgDraftCount > 0 && (
                <Button
                  variant="outline"
                  className="border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                  onClick={() => setConfirmApproveOpen(true)}
                  disabled={batchApproveMutation.isPending || emailCapReached}
                >
                  <CheckCheck className="mr-1.5 h-4 w-4" />
                  {(focusCohortLabel || fitFilter)
                    ? `Approve these ${msgDraftCount}${focusCohortLabel ? ` ${focusCohortLabel}` : ""}${fitFilter ? ` / ${fitFilter.replace(/_/g, " ")}` : ""}`
                    : `Approve all ${msgDraftCount} drafts`}
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
              )}
            </div>

            {/* Stat cards — venue/fit filtered. Hidden in inbox-style layout.
                Grid spreads them evenly across the available width so the row
                doesn't leave a hard gap on the right. */}
            {!simplifiedHeader && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 12,
            }}>
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
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 22, fontWeight: 600, color: "var(--sp-ink)", lineHeight: 1.2 }}>{value}</div>
                  <div style={{ fontSize: 11, color: "var(--sp-ink-3)", marginTop: 4, whiteSpace: "nowrap" }}>{label}</div>
                </div>
              ))}
            </div>
            )}

            {/* Venue + Fit filters, followed inline by the Focus pills strip
                (only on drafts tab when no venue is selected). Single row keeps
                related controls together; wraps to a second line on narrow widths. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{
                  fontSize: 11,
                  color: categoryFilter ? "var(--sp-accent)" : "var(--sp-ink-3)",
                  whiteSpace: "nowrap",
                  fontWeight: categoryFilter ? 600 : 400,
                }}>
                  {categoryFilter ? "Focus" : "Venue"}
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{
                    fontSize: 12, padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                    border: `1px solid ${categoryFilter ? "var(--sp-accent)" : "var(--sp-line-strong)"}`,
                    background: "var(--sp-bg-sunken)",
                    color: categoryFilter ? "var(--sp-accent)" : "var(--sp-ink-2)",
                    minWidth: 180,
                    fontWeight: categoryFilter ? 600 : 400,
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

              {/* Focus Mode discovery strip — same row as Venue/Fit when the
                  drafts tab has no venue chosen. Hidden in inbox-style layout. */}
              {!simplifiedHeader && statusFilter === "draft" && categoryFilter === "" && venueCounts.length > 0 && (
                <>
                  <span style={{
                    fontSize: 11,
                    color: "var(--sp-ink-3)",
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    marginLeft: 4,
                  }}>
                    <Target style={{ width: 12, height: 12 }} />
                    Focus next batch on
                  </span>
                  {venueCounts.slice(0, 5).map(({ value, label, count }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategoryFilter(value)}
                      title={`Generate the next batch from ${count} ${label} leads only`}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--sp-line-strong)",
                        background: "var(--sp-bg-sunken)",
                        color: "var(--sp-ink-2)",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                      <span style={{ color: "var(--sp-ink-3)", marginLeft: 4 }}>· {count}</span>
                    </button>
                  ))}
                </>
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
              {generateMutation.isSuccess && newDraftIds.size > 0 && !focusJustGenerated && (
                <>
                  <span>Just generated <strong>{newDraftIds.size}</strong> {newDraftIds.size === 1 ? "draft" : "drafts"}.</span>
                  <button
                    type="button"
                    onClick={() => setFocusJustGenerated(true)}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-300"
                  >
                    Review them →
                  </button>
                </>
              )}
              {generateMutation.isSuccess && newDraftIds.size === 0 && <span>Draft generation started.</span>}
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
          {/* Full-width status tabs — above split pane, like Gmail's category tabs.
              Hidden on /inbox so the page reads as a single-purpose destination. */}
          {!hideTabStrip && (
            <div className="sp-email-status-bar">
              {(allowedStatusTabs ?? STATUS_FILTERS).map((s) => (
                <button
                  key={s}
                  className={`sp-email-status-tab${statusFilter === s ? " active" : ""}`}
                  onClick={() => { setStatusFilter(s); setSearchQuery(""); }}
                >
                  {STATUS_FILTER_LABELS[s] ?? s}
                </button>
              ))}
            </div>
          )}

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

              {/* Cohort banner — visible when Focus Mode is active on the drafts queue */}
              {statusFilter === "draft" && focusCohortLabel && (
                <div
                  style={{
                    padding: "8px 14px",
                    borderLeft: "2px solid var(--sp-accent)",
                    background: "var(--sp-bg-sunken)",
                    fontSize: 12,
                    color: "var(--sp-ink-2)",
                  }}
                >
                  Reviewing <strong>{focusCohortLabel}</strong> batch — {allMessages.length} draft{allMessages.length === 1 ? "" : "s"} in queue
                </div>
              )}

              {/* "Just generated" pin banner — visible after Review them → */}
              {focusJustGenerated && newDraftIds.size > 0 && (
                <div
                  style={{
                    padding: "8px 14px",
                    borderLeft: "2px solid #10b981",
                    background: "rgba(16, 185, 129, 0.06)",
                    fontSize: 12,
                    color: "var(--sp-ink-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span>
                    Showing only the <strong>{newDraftIds.size}</strong> draft{newDraftIds.size === 1 ? "" : "s"} from this generation run.
                  </span>
                  <button
                    type="button"
                    onClick={() => setFocusJustGenerated(false)}
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 4,
                      border: "1px solid var(--sp-line-strong)",
                      background: "var(--sp-bg-paper)",
                      color: "var(--sp-ink-2)",
                      cursor: "pointer",
                    }}
                  >
                    Show all drafts
                  </button>
                </div>
              )}

              {/* Inbox outcome filter chips — only on the inbox view */}
              {statusFilter === "conversations" && (
                <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid var(--sp-line)", flexWrap: "wrap" }}>
                  {[
                    { value: "all", label: "All" },
                    { value: "pending", label: "Pending" },
                    { value: "interested", label: "Interested" },
                    { value: "not_interested", label: "Not interested" },
                    { value: "snoozed", label: "Snoozed" },
                  ].map((opt) => {
                    const active = inboxOutcomeFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setInboxOutcomeFilter(opt.value as typeof inboxOutcomeFilter)}
                        style={{
                          padding: "3px 10px",
                          fontSize: 11,
                          fontWeight: 500,
                          borderRadius: 999,
                          border: active ? "1px solid var(--sp-accent)" : "1px solid var(--sp-line-strong)",
                          background: active ? "var(--sp-accent-soft)" : "transparent",
                          color: active ? "var(--sp-accent-ink)" : "var(--sp-ink-3)",
                          cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Scrollable email list */}
              <ListRail
                isLoading={isLoading}
                isEmpty={allMessages.length === 0 && (!isThreadView || !conversationThreads?.length)}
                isThreadView={!!isThreadView}
                conversationThreads={conversationThreads ?? []}
                outcomeByLead={
                  statusFilter === "conversations"
                    ? new Map((conversationThreads ?? []).map((t) => [t.leadId, leadMap.get(t.leadId)?.outcome ?? null]))
                    : undefined
                }
                categoryByLead={
                  new Map((conversationThreads ?? []).map((t) => [t.leadId, leadMap.get(t.leadId)?.venue_category ?? null]))
                }
                selectedLeadId={selectedLeadId}
                onSelectThread={(leadId) => { setSelectedLeadId(leadId); markLeadRead(leadId); }}
                unreadByLead={unreadByLead}
                onLoadMore={useClientSide ? () => setConversationPageSize((n) => n + 100) : null}
                canLoadMore={useClientSide && allMessages.length >= conversationPageSize}
              >
                {!isThreadView && (
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
                          // Hide the venue pill in Focus Mode — it would just
                          // repeat the cohort label on every row. Fall back
                          // through msg.venue_category → lead.venue_category →
                          // lead.category (legacy) so chips show on every card
                          // that has any kind of category data, not just leads
                          // whose denormalized venue_category landed cleanly.
                          const lead = msg.lead_id ? leadMap.get(msg.lead_id) : null;
                          const cat = msg.venue_category
                            ?? lead?.venue_category
                            ?? lead?.category
                            ?? null;
                          const showVenue = !categoryFilter && !!cat;
                          const venueLabel = showVenue ? formatVenueLabel(cat) : "";
                          if (!fit && !venueLabel) return null;
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                              {venueLabel && (
                                <span style={{
                                  fontSize: 10,
                                  padding: "1px 7px",
                                  borderRadius: 999,
                                  background: "var(--sp-bg-sunken)",
                                  border: "1px solid var(--sp-line)",
                                  color: "var(--sp-ink-3)",
                                  whiteSpace: "nowrap",
                                  lineHeight: 1.5,
                                }}>
                                  {venueLabel}
                                </span>
                              )}
                              {fit && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: fit.color, flexShrink: 0, display: "inline-block" }} />
                                  <span style={{ fontSize: 10, color: fit.color, fontWeight: 500 }}>{fit.label}</span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {msg.subject && <div className="sp-email-item-subj">{msg.subject}</div>}
                        <div className="sp-email-item-prev">
                          {msg.content?.split("\n").filter(Boolean)[0]}
                        </div>
                      </div>
                    );
                  })
                )}
              </ListRail>{/* end scrollable list */}
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
                    outcome={leadMap.get(selectedThread.leadId)?.outcome}
                    onOpen={() => markLeadRead(selectedThread.leadId)}
                    onMarkUnread={() => markLeadUnread(selectedThread.leadId)}
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

      {/* Bulk confirm dialogs — one shared component for Approve + Regenerate */}
      <BulkConfirmDialog
        open={confirmApproveOpen}
        onClose={() => setConfirmApproveOpen(false)}
        onConfirm={handleApproveAll}
        title={
          (focusCohortLabel || fitFilter)
            ? `Approve these ${msgDraftCount} drafts?`
            : `Approve all ${msgDraftCount} drafts?`
        }
        description="Approved drafts move into the send queue. You can Undo within 10 seconds."
        breakdown={[
          focusCohortLabel ? `${focusCohortLabel} · ${msgDraftCount}` : null,
          fitFilter ? `${fitFilter.replace(/_/g, " ")} fit` : null,
        ].filter((s): s is string => s !== null)}
        confirmLabel={`Approve ${msgDraftCount}`}
        disabled={batchApproveMutation.isPending || emailCapReached}
      />
      <BulkConfirmDialog
        open={confirmRegenerateOpen}
        onClose={() => setConfirmRegenerateOpen(false)}
        onConfirm={() => regenerateAllMutation.mutate()}
        title="Regenerate all current drafts?"
        description="This rejects every current draft and regenerates them. Edits made in-place are discarded."
        confirmLabel="Regenerate all"
        destructive
        disabled={regenerateAllMutation.isPending}
      />
    </div>
  );
}

export default function OutreachPage() {
  return <OutreachView />;
}
