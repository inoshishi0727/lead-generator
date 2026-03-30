"use client";

import { useState } from "react";
import { LeadsTable } from "@/components/leads-table";
import { useLeads, useEnrichLeads } from "@/hooks/use-leads";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { Search, Sparkles, Loader2 } from "lucide-react";

const SOURCE_OPTIONS = [
  { value: "", label: "All Sources" },
  { value: "google_maps", label: "Google Maps" },
  { value: "instagram", label: "Instagram" },
];

const STAGE_OPTIONS = [
  { value: "", label: "All Stages" },
  { value: "scraped", label: "Scraped" },
  { value: "needs_email", label: "Needs Email" },
  { value: "scored", label: "Scored" },
  { value: "draft_generated", label: "Draft Generated" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
];

export default function LeadsPage() {
  const { isAdmin } = useAuth();
  const [source, setSource] = useState("");
  const [stage, setStage] = useState("");
  const [search, setSearch] = useState("");
  const [emailOnly, setEmailOnly] = useState(true);
  const enrichMutation = useEnrichLeads();

  const { data: rawLeads, isLoading } = useLeads({
    source: source || undefined,
    stage: stage || undefined,
    search: search || undefined,
  });

  const leads = emailOnly
    ? (rawLeads ?? []).filter((l) => l.email)
    : (rawLeads ?? []);

  const total = leads.length;
  const totalRaw = rawLeads?.length ?? 0;

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
        )}
      </div>

      {enrichMutation.isSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400">
          Enrichment started. This runs in the background using the backend. Check back in a few minutes.
        </div>
      )}

      {enrichMutation.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          Enrichment failed. Make sure the Python backend is running (uv run uvicorn main:app).
        </div>
      )}

      <div className="flex flex-wrap gap-3">
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

      <LeadsTable leads={leads} isLoading={isLoading} />
    </div>
  );
}
