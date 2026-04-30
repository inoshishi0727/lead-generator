"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { LeadsTable } from "@/components/leads-table";
import { useLeads, useEnrichLeads } from "@/hooks/use-leads";
import { useDebounce } from "@/hooks/use-debounce";
import { QuickAddLeadDialog } from "@/components/quick-add-lead-dialog";
import { SearchQueryManager } from "@/components/search-query-manager";
import { AssignLeadsDialog } from "@/components/assign-leads-dialog";
import { AssignRandomButton } from "@/components/assign-random-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getTeamMembers } from "@/lib/auth-admin";
import { Search, Sparkles, Loader2, Plus, Settings2, Link2Off, Mail, X, RefreshCw } from "lucide-react";

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

export default function LeadsPage() {
  const { isAdmin, isMember, user, workspaceId } = useAuth();
  const [source, setSource] = useState("");
  const [stage, setStage] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [category, setCategory] = useState("");
  const [fit, setFit] = useState("");
  const [postcode, setPostcode] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState("");
  const [emailOnly, setEmailOnly] = useState(true);
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

  const { data: rawLeads, isLoading } = useLeads({
    source: firestoreSource || undefined,
    stage: firestoreStage || undefined,
    search: debouncedSearch || undefined,
    assignedTo: effectiveAssignedTo,
  });

  const allLeads = (rawLeads ?? []).filter(
    (l) => l.stage !== "client" && l.stage !== "converted"
  );

  const enrichmentQueueCount = useMemo(
    () => allLeads.filter((l) => l.enrichment_status !== "success" && l.website).length,
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
    if (newLeadIds) filtered = filtered.filter((l) => newLeadIds.has(l.id));
    return filtered;
  }, [allLeads, source, stage, emailOnly, category, fit, postcode, assignedToFilter, noMenuUrl, newLeadIds]);

  const total = leads.length;
  const totalRaw = allLeads.length;

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

  // Auto-toggle emailOnly: email ingestion leads don't have venue emails yet,
  // so uncheck when viewing them; restore when switching to any other source.
  useEffect(() => {
    setEmailOnly(source !== "email_ingestion");
  }, [source]);

  const allNewLeads = [...newEmailLeads, ...newScrapedLeads];
  const showEmailBanner = allNewLeads.length > 0 && !emailBannerDismissed;

  return (
    <div className="sp-page space-y-6">
      {showEmailBanner && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-sky-600" />
              <span className="font-semibold text-sky-700">
                {allNewLeads.length} new lead{allNewLeads.length !== 1 ? "s" : ""} added
                {newEmailLeads.length > 0 && newScrapedLeads.length > 0
                  ? ` (${newEmailLeads.length} via email, ${newScrapedLeads.length} scraped)`
                  : newEmailLeads.length > 0 ? " via email" : " via scrape"}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="border-sky-500/40 text-sky-700 hover:bg-sky-500/10 hover:text-sky-800 h-7 text-xs"
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
          <div className="flex flex-wrap gap-1.5 pl-6">
            {allNewLeads.slice(0, 8).map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  setNewLeadIds(new Set(allNewLeads.map((ll) => ll.id)));
                  setSource(""); setStage(""); setEmailOnly(false);
                  setEmailBannerDismissed(true);
                  setOpenLeadId(l.id);
                }}
                className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs text-sky-700 hover:bg-sky-500/20 hover:text-sky-800 transition-colors"
              >
                {l.source === "email_ingestion" ? "✉ " : "🔍 "}{l.business_name}
              </button>
            ))}
            {allNewLeads.length > 8 && (
              <span className="text-xs text-sky-600/70 self-center">+{allNewLeads.length - 8} more</span>
            )}
          </div>
        </div>
      )}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {total} lead{total !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQueries(!showQueries)}
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Scrape Queries
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQuickAdd(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Quick Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => enrichMutation.mutate({})}
              disabled={enrichMutation.isPending}
              title={enrichmentQueueCount > 0 ? `${enrichmentQueueCount} leads awaiting enrichment` : "All leads enriched"}
            >
              {enrichMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Enrich{enrichmentQueueCount > 0 ? ` (${enrichmentQueueCount})` : " All"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm(`Force re-enrich all ${allLeads.length} leads? This overwrites existing enrichment data.`)) {
                  enrichMutation.mutate({ force: true });
                }
              }}
              disabled={enrichMutation.isPending}
              title="Re-enrich all leads, overwriting existing enrichment data"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Force Re-enrich
            </Button>
            <Button
              variant="outline"
              size="sm"
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
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2Off className="mr-1.5 h-3.5 w-3.5" />
              )}
              Find Menu URLs
            </Button>
          </div>
        )}
      </div>

      {enrichMutation.isSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400">
          Enrichment started. This runs in the background using the backend. Check back in a few minutes.
        </div>
      )}

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
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
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

      <div data-tour="leads-table">
        <LeadsTable
          leads={leads}
          isLoading={isLoading}
          selectable={isAdmin}
          selectedIds={selectedLeadIds}
          onSelectionChange={setSelectedLeadIds}
          openLeadId={openLeadId}
          onLeadOpened={() => setOpenLeadId(null)}
        />
      </div>

      <QuickAddLeadDialog
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
      />
    </div>
  );
}
