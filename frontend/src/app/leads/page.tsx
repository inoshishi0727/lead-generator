"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LeadsTable } from "@/components/leads-table";
import { useLeads, useEnrichLeads } from "@/hooks/use-leads";
import { QuickAddLeadDialog } from "@/components/quick-add-lead-dialog";
import { SearchQueryManager } from "@/components/search-query-manager";
import { AssignLeadsDialog } from "@/components/assign-leads-dialog";
import { AssignRandomButton } from "@/components/assign-random-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getTeamMembers } from "@/lib/auth-admin";
import { Search, Sparkles, Loader2, Plus, Settings2 } from "lucide-react";

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "google_maps", label: "Google Maps" },
  { value: "instagram", label: "Instagram" },
  { value: "manual", label: "Manual" },
];

const STAGE_OPTIONS = [
  { value: "", label: "All Stages" },
  { value: "pending_enrichment", label: "Queued for Scrape" },
  { value: "scraped", label: "Scraped" },
  { value: "needs_email", label: "Needs Email" },
  { value: "scored", label: "Scored" },
  { value: "draft_generated", label: "Draft Generated" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
];

export default function LeadsPage() {
  const { isAdmin, isMember, user, workspaceId } = useAuth();
  const [source, setSource] = useState("");
  const [stage, setStage] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [fit, setFit] = useState("");
  const [postcode, setPostcode] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState("");
  const [emailOnly, setEmailOnly] = useState(true);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showQueries, setShowQueries] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
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
  const firestoreSource = source === "manual" ? undefined : source;

  // Member auto-scopes to own leads; admin uses client-side filter for unassigned
  const effectiveAssignedTo = isMember
    ? user?.uid
    : assignedToFilter === "__unassigned__"
      ? undefined  // fetch all, filter client-side
      : assignedToFilter || undefined;

  const { data: rawLeads, isLoading } = useLeads({
    source: firestoreSource || undefined,
    stage: firestoreStage || undefined,
    search: search || undefined,
    assignedTo: effectiveAssignedTo,
  });

  const allLeads = rawLeads ?? [];

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
    if (stage === "pending_enrichment")
      filtered = filtered.filter((l) => l.enrichment_status !== "success");
    if (emailOnly) filtered = filtered.filter((l) => l.email);
    if (category) filtered = filtered.filter((l) => (l.venue_category || l.category) === category);
    if (fit) filtered = filtered.filter((l) => l.menu_fit === fit);
    if (postcode) filtered = filtered.filter((l) => getDistrict(l.location_postcode) === postcode);
    if (assignedToFilter === "__unassigned__") filtered = filtered.filter((l) => !l.assigned_to);
    return filtered;
  }, [allLeads, source, stage, emailOnly, category, fit, postcode, assignedToFilter]);

  const total = leads.length;
  const totalRaw = allLeads.length;

  return (
    <div className="space-y-6">
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
            >
              {enrichMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Enrich All
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

      <div data-tour="leads-filters" className="flex flex-wrap gap-3">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
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
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {STAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
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
          className="rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
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
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
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

        <div className="relative max-w-sm flex-1">
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
      </div>

      {isAdmin && selectedLeadIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-2">
          <span className="text-sm text-muted-foreground">
            {selectedLeadIds.length} selected
          </span>
          <AssignLeadsDialog
            leadIds={selectedLeadIds}
            onDone={() => setSelectedLeadIds([])}
          />
        </div>
      )}

      {isAdmin && teamMembers.length > 1 && (
        <AssignRandomButton leads={leads} onDone={() => setSelectedLeadIds([])} />
      )}

      <div data-tour="leads-table">
        <LeadsTable
          leads={leads}
          isLoading={isLoading}
          selectable={isAdmin}
          selectedIds={selectedLeadIds}
          onSelectionChange={setSelectedLeadIds}
        />
      </div>

      <QuickAddLeadDialog
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
      />
    </div>
  );
}
