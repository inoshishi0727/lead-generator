"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LeadsTable } from "@/components/leads-table";
import { useEnrichLeads } from "@/hooks/use-leads";
import { useInfiniteLeads } from "@/hooks/use-infinite-leads";
import { useDebounce } from "@/hooks/use-debounce";
import { QuickAddLeadDialog } from "@/components/quick-add-lead-dialog";
import { SearchQueryManager } from "@/components/search-query-manager";
import { AssignLeadsDialog } from "@/components/assign-leads-dialog";
import { BulkScrapeSelectedButton } from "@/components/bulk-scrape-selected-button";
import { AssignRandomButton } from "@/components/assign-random-button";
import { EnrichmentProgressPanel } from "@/components/enrichment-progress-panel";
import { StaleLeadsCard } from "@/components/stale-leads-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getTeamMembers } from "@/lib/auth-admin";
import { Search, Sparkles, Loader2, Plus, Settings2, Link2Off, Mail, X, RefreshCw, MoreHorizontal } from "lucide-react";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/menu";
import { LeadsFilterBanner, type ActiveFilter } from "@/components/leads-filter-banner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useViewedLeads } from "@/lib/lead-viewed";
import { priorityScore } from "@/lib/priority-score";
import { AutocompleteInput, type Suggestion } from "@/components/autocomplete-input";
import type { Lead } from "@/lib/types";

type SortOption =
  | "newest"
  | "oldest"
  | "recent_24h"
  | "last_7d"
  | "highest_score"
  | "highest_priority"
  | "needs_attention";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest_priority", label: "Highest priority" },
  { value: "highest_score", label: "Highest score" },
  { value: "recent_24h", label: "Recently added (24h)" },
  { value: "last_7d", label: "Last 7 days" },
  { value: "needs_attention", label: "Needs attention" },
];

const VALID_SORTS = new Set<SortOption>(SORT_OPTIONS.map((o) => o.value));

function parseSort(value: string | null): SortOption {
  if (value && VALID_SORTS.has(value as SortOption)) return value as SortOption;
  return "newest";
}

type RecencyOption = "all" | "today" | "7d" | "30d";

const RECENCY_OPTIONS: { value: RecencyOption; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

const VALID_RECENCY = new Set<RecencyOption>(RECENCY_OPTIONS.map((o) => o.value));

function parseRecency(value: string | null): RecencyOption {
  if (value && VALID_RECENCY.has(value as RecencyOption)) return value as RecencyOption;
  return "all";
}

function applyRecencyFilter(leads: Lead[], recency: RecencyOption): Lead[] {
  if (recency === "all") return leads;
  const now = Date.now();
  const window =
    recency === "today" ? 24 * 60 * 60 * 1000 :
    recency === "7d" ? 7 * 24 * 60 * 60 * 1000 :
    30 * 24 * 60 * 60 * 1000;
  const cutoff = now - window;
  return leads.filter((l) => {
    const t = ts(l.created_at);
    return t !== null && t >= cutoff;
  });
}

function ts(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

function compareNullsLast(a: number | null, b: number | null, dir: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "desc" ? b - a : a - b;
}

function applySort(input: Lead[], sort: SortOption): Lead[] {
  const now = Date.now();
  const arr = [...input];
  switch (sort) {
    case "newest":
      arr.sort((a, b) => compareNullsLast(ts(a.created_at), ts(b.created_at), "desc"));
      return arr;
    case "oldest":
      arr.sort((a, b) => compareNullsLast(ts(a.created_at), ts(b.created_at), "asc"));
      return arr;
    case "recent_24h": {
      const cutoff = now - 24 * 60 * 60 * 1000;
      return arr
        .filter((l) => {
          const t = ts(l.created_at);
          return t !== null && t >= cutoff;
        })
        .sort((a, b) => compareNullsLast(ts(a.created_at), ts(b.created_at), "desc"));
    }
    case "last_7d": {
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;
      return arr
        .filter((l) => {
          const t = ts(l.created_at);
          return t !== null && t >= cutoff;
        })
        .sort((a, b) => compareNullsLast(ts(a.created_at), ts(b.created_at), "desc"));
    }
    case "highest_score":
      arr.sort((a, b) => {
        const s = compareNullsLast(a.score, b.score, "desc");
        if (s !== 0) return s;
        return compareNullsLast(ts(a.created_at), ts(b.created_at), "desc");
      });
      return arr;
    case "highest_priority":
      arr.sort((a, b) => {
        const pa = priorityScore(a);
        const pb = priorityScore(b);
        if (pb !== pa) return pb - pa;
        return compareNullsLast(ts(a.created_at), ts(b.created_at), "desc");
      });
      return arr;
    case "needs_attention": {
      const staleCutoff = now - 14 * 24 * 60 * 60 * 1000;
      return arr
        .filter((l) => {
          if (l.enrichment_status !== "success") return true;
          const t = ts(l.created_at);
          if (t !== null && t < staleCutoff && !l.email) return true;
          return false;
        })
        .sort((a, b) => compareNullsLast(ts(a.created_at), ts(b.created_at), "desc"));
    }
  }
}

function computeLatestCohort(leads: Lead[]): Set<string> {
  if (leads.length === 0) return new Set();
  const withBatch = leads.filter((l) => l.batch_id);
  if (withBatch.length > 0) {
    const counts = new Map<string, { count: number; latest: number }>();
    for (const l of withBatch) {
      const t = ts(l.created_at) ?? 0;
      const prev = counts.get(l.batch_id!);
      if (prev) {
        prev.count += 1;
        if (t > prev.latest) prev.latest = t;
      } else {
        counts.set(l.batch_id!, { count: 1, latest: t });
      }
    }
    let topBatch: string | null = null;
    let topLatest = -Infinity;
    for (const [batchId, info] of counts) {
      if (info.latest > topLatest) {
        topLatest = info.latest;
        topBatch = batchId;
      }
    }
    if (topBatch) {
      return new Set(leads.filter((l) => l.batch_id === topBatch).map((l) => l.id));
    }
  }
  let max = -Infinity;
  for (const l of leads) {
    const t = ts(l.created_at);
    if (t !== null && t > max) max = t;
  }
  if (max === -Infinity) return new Set();
  const windowStart = max - 60 * 60 * 1000;
  return new Set(
    leads
      .filter((l) => {
        const t = ts(l.created_at);
        return t !== null && t >= windowStart;
      })
      .map((l) => l.id)
  );
}

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "google_maps", label: "Google Maps" },
  { value: "instagram", label: "Instagram" },
  { value: "manual", label: "Manual" },
  { value: "email_ingestion", label: "Via Email" },
];

const STAGE_GROUPS = [
  {
    label: "Pre-send",
    options: [
      { value: "pending_enrichment", label: "Queued for Scrape" },
      { value: "scraped", label: "Scraped" },
      { value: "needs_email", label: "Needs Email" },
      { value: "enriched", label: "Enriched" },
      { value: "scored", label: "Scored" },
      { value: "draft_generated", label: "Draft Generated" },
      { value: "approved", label: "Approved" },
    ],
  },
  {
    label: "Active Outreach",
    options: [
      { value: "sent", label: "Sent" },
      { value: "follow_up_1", label: "Follow-up 1" },
      { value: "follow_up_2", label: "Follow-up 2" },
    ],
  },
  {
    label: "Outcomes",
    options: [
      { value: "responded", label: "Responded" },
      { value: "declined", label: "Declined" },
    ],
  },
];

function LeadsPageInner() {
  const { isAdmin, isMember, user, workspaceId } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [source, setSource] = useState("");
  const [stage, setStage] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [tag, setTag] = useState(() => searchParams.get("tag") ?? "");
  const [sort, setSort] = useState<SortOption>(() => parseSort(searchParams.get("sort")));
  const [recency, setRecency] = useState<RecencyOption>(() => parseRecency(searchParams.get("recency")));
  const debouncedSearch = useDebounce(search, 300);
  const viewedSet = useViewedLeads();

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearch(q);
    const tagParam = searchParams.get("tag") ?? "";
    setTag((curr) => (curr === tagParam ? curr : tagParam));
    const s = parseSort(searchParams.get("sort"));
    setSort((curr) => (curr === s ? curr : s));
    const r = parseRecency(searchParams.get("recency"));
    setRecency((curr) => (curr === r ? curr : r));
    const focus = searchParams.get("focus");
    if (focus) {
      setOpenLeadId(focus);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("focus");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [searchParams]);

  const setTagFilter = (value: string) => {
    setTag(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("tag", value);
    else params.delete("tag");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const handleSortChange = (value: SortOption) => {
    setSort(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === "newest") params.delete("sort");
    else params.set("sort", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const handleRecencyChange = (value: RecencyOption) => {
    setRecency(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("recency");
    else params.set("recency", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const [category, setCategory] = useState("");
  const [fit, setFit] = useState("");
  const [postcode, setPostcode] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState("");
  const [emailOnly, setEmailOnly] = useState(false);
  const [noMenuUrl, setNoMenuUrl] = useState(false);
  const [menuUrlLoading, setMenuUrlLoading] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(false);
  const [showQueries, setShowQueries] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [newLeadIds, setNewLeadIds] = useState<Set<string> | null>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const enrichMutation = useEnrichLeads();

  const teamQuery = useQuery({
    queryKey: ["team", workspaceId],
    queryFn: () => getTeamMembers(workspaceId ?? ""),
    enabled: isAdmin && !!workspaceId,
  });
  const teamMembers = teamQuery.data ?? [];

  // Extract outward code (district) from a UK postcode, e.g. "SE26 5HS" -> "SE26"
  const getDistrict = (pc: string | null | undefined) =>
    pc ? pc.trim().split(/\s+/)[0]?.toUpperCase() : null;

  // "pending_enrichment" is a virtual stage filtered client-side, not a real Firestore value
  const firestoreStage = stage === "pending_enrichment" ? undefined : stage;
  const firestoreSource = (source === "manual" || source === "email_ingestion") ? undefined : source;

  // Member auto-scopes to own leads; admin uses client-side filter for unassigned
  const effectiveAssignedTo = isMember
    ? user?.uid
    : assignedToFilter === "__unassigned__"
      ? undefined  // fetch all, filter client-side
      : assignedToFilter || undefined;

  const {
    data: pagedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteLeads({
    filters: {
      source: firestoreSource || undefined,
      stage: firestoreStage || undefined,
      assignedTo: effectiveAssignedTo,
    },
  });

  const rawLeads = useMemo(
    () => (pagedData?.pages ?? []).flatMap((p) => p.leads),
    [pagedData],
  );

  const allLeads = useMemo(
    () => rawLeads.filter((l) => l.stage !== "client" && l.stage !== "converted"),
    [rawLeads],
  );

  // Classic page-by-page navigation over the filtered result. Server-side we
  // fetch in cursor batches (LEADS_PAGE_SIZE) so big datasets stay fast; the UI
  // surfaces 10 visible rows per page regardless.
  const DISPLAY_PAGE_SIZE = 10;
  const [pageIndex, setPageIndex] = useState(0);

  // Background-prefetch the rest of the dataset once the first page lands.
  // The filter dropdowns (category / fit / postcode / tag) compute their counts
  // from `allLeads`; without prefetch they'd reflect "only what's loaded so far"
  // which reads as data loss. Capped to PREFETCH_PAGE_CAP server pages
  // (PREFETCH_PAGE_CAP × LEADS_PAGE_SIZE rows) so a runaway dataset can't lock
  // the tab; pagination still works past that cap via the Next button.
  const PREFETCH_PAGE_CAP = 100;
  const loadedServerPages = pagedData?.pages.length ?? 0;
  useEffect(() => {
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      loadedServerPages > 0 &&
      loadedServerPages < PREFETCH_PAGE_CAP
    ) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, loadedServerPages]);

  const enrichmentQueueCount = useMemo(
    () => allLeads.filter((l) => l.enrichment_status !== "success" && l.website).length,
    [allLeads]
  );

  const wholesalerCount = useMemo(
    () => allLeads.filter((l) => (l.venue_category || l.category) === "wholesaler").length,
    [allLeads]
  );

  // Each dropdown's counts respect all OTHER active filters
  const FIT_ORDER = ["strong", "moderate", "weak", "unknown"];

  const categoryOptions = useMemo(() => {
    let pool = emailOnly ? allLeads.filter((l) => l.email) : allLeads;
    if (fit) pool = pool.filter((l) => l.menu_fit === fit);
    if (postcode) pool = pool.filter((l) => getDistrict(l.location_postcode) === postcode);
    const counts = new Map<string, number>();
    pool.forEach((l) => {
      const c = l.venue_category || l.category;
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort(([, a], [, b]) => b - a);
  }, [allLeads, emailOnly, fit, postcode]);

  const fitOptions = useMemo(() => {
    let pool = emailOnly ? allLeads.filter((l) => l.email) : allLeads;
    if (category) pool = pool.filter((l) => (l.venue_category || l.category) === category);
    if (postcode) pool = pool.filter((l) => getDistrict(l.location_postcode) === postcode);
    const counts = new Map<string, number>();
    pool.forEach((l) => {
      if (l.menu_fit) counts.set(l.menu_fit, (counts.get(l.menu_fit) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort(
      ([a], [b]) => (FIT_ORDER.indexOf(a) === -1 ? 99 : FIT_ORDER.indexOf(a)) - (FIT_ORDER.indexOf(b) === -1 ? 99 : FIT_ORDER.indexOf(b))
    );
  }, [allLeads, emailOnly, category, postcode]);

  const postcodeOptions = useMemo(() => {
    let pool = emailOnly ? allLeads.filter((l) => l.email) : allLeads;
    if (category) pool = pool.filter((l) => (l.venue_category || l.category) === category);
    if (fit) pool = pool.filter((l) => l.menu_fit === fit);
    const counts = new Map<string, number>();
    pool.forEach((l) => {
      const d = getDistrict(l.location_postcode);
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allLeads, emailOnly, category, fit]);

  const tagOptions = useMemo(() => {
    const pool = emailOnly ? allLeads.filter((l) => l.email) : allLeads;
    const counts = new Map<string, number>();
    pool.forEach((l) => {
      for (const t of [...(l.tags ?? []), ...(l.auto_tags ?? [])]) {
        if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allLeads, emailOnly]);

  const leads = useMemo(() => {
    let filtered = allLeads;
    if (source === "manual") filtered = filtered.filter((l) => l.source === "manual");
    if (source === "email_ingestion") filtered = filtered.filter((l) => l.source === "email_ingestion");
    if (stage === "pending_enrichment")
      filtered = filtered.filter((l) => l.enrichment_status !== "success");
    if (emailOnly) filtered = filtered.filter((l) => l.email);
    if (category) filtered = filtered.filter((l) => (l.venue_category || l.category) === category);
    if (fit) filtered = filtered.filter((l) => l.menu_fit === fit);
    if (postcode) filtered = filtered.filter((l) => getDistrict(l.location_postcode) === postcode);
    if (assignedToFilter === "__unassigned__") filtered = filtered.filter((l) => !l.assigned_to);
    if (noMenuUrl) filtered = filtered.filter((l) => !l.menu_url || l.menu_url === "not_found");
    if (tag) filtered = filtered.filter((l) => (l.tags ?? []).includes(tag) || (l.auto_tags ?? []).includes(tag));
    if (newLeadIds) filtered = filtered.filter((l) => newLeadIds.has(l.id));
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      filtered = filtered.filter((l) => (l.business_name ?? "").toLowerCase().includes(s));
    }
    filtered = applyRecencyFilter(filtered, recency);
    return applySort(filtered, sort);
  }, [allLeads, source, stage, emailOnly, category, fit, postcode, assignedToFilter, noMenuUrl, tag, newLeadIds, debouncedSearch, sort, recency]);

  const latestCohort = useMemo(() => computeLatestCohort(allLeads), [allLeads]);

  const searchSuggestions: Suggestion[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || allLeads.length === 0) return [];
    const matches: { lead: Lead; weight: number }[] = [];
    for (const lead of allLeads) {
      const name = (lead.business_name ?? "").toLowerCase();
      const email = (lead.email ?? "").toLowerCase();
      const city = (lead.location_city ?? "").toLowerCase();
      const area = (lead.location_area ?? "").toLowerCase();
      if (!name && !email) continue;
      if (name.startsWith(q)) matches.push({ lead, weight: 0 });
      else if (name.includes(q)) matches.push({ lead, weight: 1 });
      else if (email.includes(q)) matches.push({ lead, weight: 2 });
      else if (city.includes(q) || area.includes(q)) matches.push({ lead, weight: 3 });
      if (matches.length >= 60) break;
    }
    matches.sort((a, b) => a.weight - b.weight);
    return matches.slice(0, 8).map(({ lead }) => ({
      id: lead.id,
      label: lead.business_name || "(unnamed)",
      sublabel: [lead.email, lead.location_area || lead.location_city].filter(Boolean).join(" · ") || undefined,
      meta: lead.venue_category?.replace(/_/g, " ") ?? undefined,
    }));
  }, [search, allLeads]);

  const total = leads.length;
  const totalRaw = allLeads.length;

  // Reset to page 1 whenever the filter shape changes — without this, a user
  // applying a tag filter while on page 6 would land on an empty page.
  useEffect(() => {
    setPageIndex(0);
  }, [source, stage, emailOnly, category, fit, postcode, assignedToFilter, noMenuUrl, tag, debouncedSearch, recency, sort]);

  // Display-page math. `pageCount` is the page count over leads loaded so far;
  // when the server has more pages available we add "+" semantics to the UI so
  // the operator knows the count can grow.
  const pageCount = Math.max(1, Math.ceil(total / DISPLAY_PAGE_SIZE));
  const currentPage = Math.min(pageIndex, pageCount - 1);
  const visibleLeads = leads.slice(
    currentPage * DISPLAY_PAGE_SIZE,
    (currentPage + 1) * DISPLAY_PAGE_SIZE,
  );

  // Pull more server-side rows whenever the current display page is at or past
  // the loaded-set edge — keeps "Next" responsive even with active client filters.
  useEffect(() => {
    const needsMore = (currentPage + 1) * DISPLAY_PAGE_SIZE >= total;
    if (needsMore && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [currentPage, total, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Build the visible chip list shown by the LeadsFilterBanner so any narrowed
  // pool surfaces a clearable indicator (the prior layout silently hid leads
  // behind the default-on "Email only" filter — Fable flagged this as a "602
  // vs 1040" inconsistency).
  const activeFilters: ActiveFilter[] = useMemo(() => {
    const out: ActiveFilter[] = [];
    if (source) out.push({ key: "source", label: `Source: ${source.replace(/_/g, " ")}`, onClear: () => setSource("") });
    if (stage) out.push({ key: "stage", label: `Stage: ${stage.replace(/_/g, " ")}`, onClear: () => setStage("") });
    if (category) out.push({ key: "category", label: `Venue: ${category.replace(/_/g, " ")}`, onClear: () => setCategory("") });
    if (fit) out.push({ key: "fit", label: `Fit: ${fit}`, onClear: () => setFit("") });
    if (postcode) out.push({ key: "postcode", label: `Postcode: ${postcode}`, onClear: () => setPostcode("") });
    if (assignedToFilter) out.push({ key: "assignedTo", label: assignedToFilter === "__unassigned__" ? "Unassigned" : `Assigned: ${assignedToFilter}`, onClear: () => setAssignedToFilter("") });
    if (emailOnly) out.push({ key: "emailOnly", label: "Email only", onClear: () => setEmailOnly(false) });
    if (noMenuUrl) out.push({ key: "noMenuUrl", label: "No menu URL", onClear: () => setNoMenuUrl(false) });
    if (tag) out.push({ key: "tag", label: `Tag: ${tag.replace("revisit:", "revisit ")}`, onClear: () => setTagFilter("") });
    if (search) out.push({ key: "search", label: `Search: ${search}`, onClear: () => setSearch("") });
    return out;
  }, [source, stage, category, fit, postcode, assignedToFilter, emailOnly, noMenuUrl, tag, search]);

  const clearAllFilters = () => {
    setSource("");
    setStage("");
    setCategory("");
    setFit("");
    setPostcode("");
    setAssignedToFilter("");
    setEmailOnly(false);
    setNoMenuUrl(false);
    setSearch("");
    setTagFilter("");
  };

  const DISMISS_KEY = "new_leads_banner_dismissed_at";
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  const { newEmailLeads, newScrapedLeads } = useMemo(() => {
    const dismissedAt = typeof window !== "undefined"
      ? Number(localStorage.getItem(DISMISS_KEY) ?? 0)
      : 0;
    const since = Math.max(cutoff, dismissedAt);
    const email = allLeads.filter(
      (l) => l.source === "email_ingestion" && l.scraped_at && new Date(l.scraped_at).getTime() > since
    );
    const scraped = allLeads.filter(
      (l) => l.source === "google_maps" && l.scraped_at && new Date(l.scraped_at).getTime() > since
    );
    return { newEmailLeads: email, newScrapedLeads: scraped };
  }, [allLeads]);

  useEffect(() => {
    if (emailBannerDismissed) {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
  }, [emailBannerDismissed]);

  // Email-ingestion leads don't have venue emails yet — force the "email only"
  // filter off when viewing them so the table isn't accidentally empty. Other
  // sources keep whatever the operator chose.
  useEffect(() => {
    if (source === "email_ingestion") setEmailOnly(false);
  }, [source]);

  const allNewLeads = [...newEmailLeads, ...newScrapedLeads];
  const showEmailBanner = allNewLeads.length > 0 && !emailBannerDismissed;

  return (
    <div className="sp-page space-y-6">
      <div className="sp-page-head">
        <div>
          <h1 className="sp-page-title">Leads</h1>
          <div className="sp-page-subtitle">
            {total} lead{total !== 1 ? "s" : ""}
            {hasNextPage && (
              <span className="ml-2 text-xs text-muted-foreground">
                · loading more for accurate filter counts…
              </span>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="sp-page-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQueries(!showQueries)}
              title="Open scrape queries panel — find new venues to add to the pipeline"
            >
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Find new venues
            </Button>
            {enrichmentQueueCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => enrichMutation.mutate({})}
                disabled={enrichMutation.isPending}
                title={`${enrichmentQueueCount} leads awaiting enrichment`}
              >
                {enrichMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Update missing info ({enrichmentQueueCount})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQuickAdd(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Quick Add
            </Button>
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    title="Data tools — re-enrich, find menu URLs, etc."
                  >
                    <MoreHorizontal className="mr-1.5 h-3.5 w-3.5" />
                    Data
                  </Button>
                }
              />
              <MenuContent align="end">
                <MenuItem
                  onClick={() => {
                    if (confirm(`Force re-enrich all ${allLeads.length} leads? This overwrites existing enrichment data.`)) {
                      enrichMutation.mutate({ force: true });
                    }
                  }}
                  disabled={enrichMutation.isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Force re-enrich all
                </MenuItem>
                <MenuItem
                  disabled={menuUrlLoading}
                  onClick={async () => {
                    setMenuUrlLoading(true);
                    try {
                      const res = await fetch("/api/enrich-menu-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 50 }) });
                      const data = await res.json();
                      alert(`Menu URL scan done: ${data.found} found, ${data.not_found} not found, ${data.failed} failed`);
                    } catch (e: any) {
                      alert("Menu URL scan failed: " + e.message);
                    } finally {
                      setMenuUrlLoading(false);
                    }
                  }}
                >
                  {menuUrlLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2Off className="h-3.5 w-3.5" />
                  )}
                  Find missing menu URLs
                </MenuItem>
                <MenuItem onClick={() => setShowQueries(true)}>
                  <Settings2 className="h-3.5 w-3.5" />
                  Manage scrape queries
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        )}
      </div>

      {/* Live per-lead progress for the bulk "Update missing info" enrichment,
          persistent across navigation. Replaces the old static banner. */}
      <EnrichmentProgressPanel />

      {/* Leads stuck in pre-enrichment (moved here from the Dashboard so the
          re-enrich shortcut sits next to the leads it acts on). */}
      <StaleLeadsCard />

      {enrichMutation.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          Enrichment failed.{" "}
          {enrichMutation.error instanceof Error && enrichMutation.error.message
            ? enrichMutation.error.message
            : "Check the backend server logs for details."}
        </div>
      )}

      {showQueries && <SearchQueryManager />}

      <div data-tour="leads-filters" className="sticky top-0 z-30 bg-background pt-2 pb-3 -mx-7 px-7 border-b border-border/30 space-y-2">
        {/* Quick-filter chips — extend with more as new categories warrant their own shortcut */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory(category === "wholesaler" ? "" : "wholesaler")}
            aria-pressed={category === "wholesaler"}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
              (category === "wholesaler"
                ? "border-indigo-500 bg-indigo-500 text-white"
                : "border-input bg-background text-foreground hover:bg-accent")
            }
            title="Show only wholesaler / distributor leads"
          >
            Wholesalers
            <span
              className={
                "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums " +
                (category === "wholesaler"
                  ? "bg-white/20 text-white"
                  : "bg-muted text-muted-foreground")
              }
            >
              {wholesalerCount}
            </span>
          </button>
        </div>

        {/* Row 1: dropdowns — fixed widths so they never resize when options change */}
        <div className="flex flex-wrap gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Stages</option>
            {STAGE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-44 rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
          >
            <option value="">All Categories</option>
            {categoryOptions.map(([c, count]) => (
              <option key={c} value={c} className="capitalize">
                {c.replace(/_/g, " ")} ({count})
              </option>
            ))}
          </select>

          <select
            value={fit}
            onChange={(e) => setFit(e.target.value)}
            className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
          >
            <option value="">All Fits</option>
            {fitOptions.map(([f, count]) => (
              <option key={f} value={f} className="capitalize">
                {f} ({count})
              </option>
            ))}
          </select>

          <select
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            className="w-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Postcodes</option>
            {postcodeOptions.map(([pc, count]) => (
              <option key={pc} value={pc}>
                {pc} ({count})
              </option>
            ))}
          </select>

          <select
            value={tag}
            onChange={(e) => setTagFilter(e.target.value)}
            className="w-44 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Tags</option>
            {tagOptions.map(([t, count]) => (
              <option key={t} value={t}>
                {t.replace("revisit:", "revisit ").replace(/_/g, " ")} ({count})
              </option>
            ))}
          </select>

          {isAdmin && teamMembers.length > 1 && (
            <select
              value={assignedToFilter}
              onChange={(e) => setAssignedToFilter(e.target.value)}
              className="w-36 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">All Members</option>
              <option value="__unassigned__">Unassigned</option>
              {teamMembers.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.display_name || m.email}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Row 2: search + checkboxes — always on its own line, never reflowed */}
        <div className="flex items-center gap-4">
          <AutocompleteInput
            className="w-72"
            placeholder="Search leads..."
            value={search}
            onChange={setSearch}
            suggestions={searchSuggestions}
            onSelect={(s) => {
              setOpenLeadId(s.id);
              setSearch("");
            }}
          />


          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sort:</span>
            <Select
              value={sort}
              onValueChange={(v) => handleSortChange(v as SortOption)}
            >
              <SelectTrigger className="w-48" aria-label="Sort leads">
                <SelectValue placeholder="Newest first" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5 text-sm" role="group" aria-label="Filter by added date">
            <span className="text-muted-foreground">Added:</span>
            {RECENCY_OPTIONS.map((opt) => {
              const active = recency === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleRecencyChange(opt.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:bg-muted/40 hover:text-foreground"
                  }`}
                  aria-pressed={active}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={emailOnly}
              onChange={(e) => setEmailOnly(e.target.checked)}
              className="rounded accent-primary"
            />
            Email only
            {emailOnly && totalRaw > total && (
              <span className="text-xs text-muted-foreground">
                ({totalRaw - total} hidden)
              </span>
            )}
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={noMenuUrl}
              onChange={(e) => setNoMenuUrl(e.target.checked)}
              className="rounded accent-primary"
            />
            No menu URL
          </label>
        </div>
      </div>

      {isAdmin && selectedLeadIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-2">
          <span className="text-sm text-muted-foreground">
            {selectedLeadIds.length} selected
          </span>
          <BulkScrapeSelectedButton
            leadIds={selectedLeadIds}
            onDone={() => setSelectedLeadIds([])}
          />
          <AssignLeadsDialog
            leadIds={selectedLeadIds}
            leads={leads}
            onDone={() => setSelectedLeadIds([])}
          />
        </div>
      )}

      {isAdmin && teamMembers.length > 1 && (
        <AssignRandomButton leads={leads} onDone={() => setSelectedLeadIds([])} />
      )}

      {newLeadIds && (
        <div className="flex items-center gap-2 text-sm text-sky-400">
          <span>Showing {leads.length} new lead{leads.length !== 1 ? "s" : ""} only</span>
          <button
            onClick={() => setNewLeadIds(null)}
            className="underline underline-offset-2 hover:text-sky-200 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {showEmailBanner && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <Mail className="h-4 w-4 shrink-0 text-sky-600" />
              <span className="font-semibold text-sky-700 shrink-0">
                {allNewLeads.length} new lead{allNewLeads.length !== 1 ? "s" : ""}
                {newEmailLeads.length > 0 ? " via email" : " via scrape"}
              </span>
              <div className="flex flex-wrap gap-1 min-w-0">
                {allNewLeads.slice(0, 6).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      setNewLeadIds(new Set(allNewLeads.map((ll) => ll.id)));
                      setSource(""); setStage(""); setEmailOnly(false);
                      setEmailBannerDismissed(true);
                      setOpenLeadId(l.id);
                    }}
                    className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs text-sky-700 hover:bg-sky-500/20 transition-colors"
                  >
                    {l.business_name}
                  </button>
                ))}
                {allNewLeads.length > 6 && (
                  <span className="text-xs text-sky-600/70 self-center">+{allNewLeads.length - 6} more</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="border-sky-500/40 text-sky-700 hover:bg-sky-500/10 h-6 text-xs px-2"
                onClick={() => {
                  setNewLeadIds(new Set(allNewLeads.map((l) => l.id)));
                  setSource(""); setStage(""); setEmailOnly(false);
                  setEmailBannerDismissed(true);
                }}
              >
                Show all {allNewLeads.length}
              </Button>
              <button
                onClick={() => setEmailBannerDismissed(true)}
                className="text-sky-600 hover:text-sky-800 transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <LeadsFilterBanner
        total={total}
        totalRaw={totalRaw}
        activeFilters={activeFilters}
        onClearAll={clearAllFilters}
      />

      <div data-tour="leads-table">
        <LeadsTable
          leads={visibleLeads}
          isLoading={isLoading || (isFetchingNextPage && visibleLeads.length === 0)}
          selectable={isAdmin}
          selectedIds={selectedLeadIds}
          onSelectionChange={setSelectedLeadIds}
          openLeadId={openLeadId}
          onLeadOpened={() => setOpenLeadId(null)}
          latestCohort={latestCohort}
          viewedSet={viewedSet}
          onTagClick={setTagFilter}
        />

        {/* Classic pagination. The page count may grow as more server pages
            stream in for very large datasets — that's why the indicator shows
            "+ more" when the server still has rows the client hasn't fetched. */}
        <div className="flex items-center justify-between gap-2 py-4 text-xs text-muted-foreground">
          <div>
            {total === 0 ? (
              "No leads"
            ) : (
              <>
                Showing {currentPage * DISPLAY_PAGE_SIZE + 1}–{currentPage * DISPLAY_PAGE_SIZE + visibleLeads.length} of {total}
                {hasNextPage ? "+ more" : ""}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPageIndex(Math.max(0, currentPage - 1))}
            >
              Prev
            </Button>
            <span className="px-1 tabular-nums">
              Page {currentPage + 1} of {pageCount}
              {hasNextPage ? "+" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={
                (currentPage >= pageCount - 1 && !hasNextPage) || isFetchingNextPage
              }
              onClick={() => setPageIndex(currentPage + 1)}
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Loading…
                </>
              ) : (
                "Next"
              )}
            </Button>
          </div>
        </div>
      </div>

      <QuickAddLeadDialog
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
      />
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsPageInner />
    </Suspense>
  );
}
