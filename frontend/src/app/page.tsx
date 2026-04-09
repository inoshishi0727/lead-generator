"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrapeControl } from "@/components/scrape-control";
import { ScrapeHistory } from "@/components/scrape-history";
import { ScrapeStatus } from "@/components/scrape-status";
import { OutreachPlan } from "@/components/outreach-plan";
import { LeadDetailDialog } from "@/components/lead-detail-dialog";
import { useScrape } from "@/hooks/use-scrape";
import { useLeads } from "@/hooks/use-leads";
import { useMessages } from "@/hooks/use-outreach";
import {
  Users,
  Mail,
  FileText,
  Send,
  ChevronRight,
  Upload,
  Download,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useImportQueries, type SearchQueries } from "@/hooks/use-search-queries";
import { toast } from "sonner";
import type { Lead } from "@/lib/types";

const SOURCE_KEYS: (keyof SearchQueries)[] = [
  "google_maps", "google_search", "bing_search", "directory",
];

const SOURCE_LABELS: Record<string, string> = {
  google_maps: "Google Maps",
  google_search: "Google Search",
  bing_search: "Bing Search",
  directory: "Directory URLs",
};

function downloadTemplate() {
  const csv = [
    "source,query",
    "google_maps,cocktail bars London",
    "google_maps,wine bars Manchester",
    "google_search,UK spirits subscription box companies",
    "bing_search,airline beverage suppliers UK",
    "directory,https://www.yell.com/s/cocktail+bars-london.html",
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "scrape-queries-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const { startScrape, isStarting, status } = useScrape();
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: messages } = useMessages();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const importMutation = useImportQueries();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [uploadedQueries, setUploadedQueries] = useState<Record<string, string[]> | null>(null);

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
      if (lines.length === 0) return;
      const first = lines[0].toLowerCase();
      if (first.includes("source") && first.includes("query")) {
        const grouped: Record<string, string[]> = {};
        for (let i = 1; i < lines.length; i++) {
          const idx = lines[i].indexOf(",");
          if (idx === -1) continue;
          const src = lines[i].slice(0, idx).trim().toLowerCase();
          const q = lines[i].slice(idx + 1).trim().replace(/^"|"$/g, "");
          if (!src || !q) continue;
          if (!grouped[src]) grouped[src] = [];
          grouped[src].push(q);
        }
        let count = 0;
        for (const [src, qs] of Object.entries(grouped)) {
          if (SOURCE_KEYS.includes(src as keyof SearchQueries)) {
            importMutation.mutate({ source: src, queries: qs });
            count += qs.length;
          }
        }
        if (count > 0) {
          setUploadedQueries(grouped);
          toast.success(`Imported ${count} scrape queries`);
        } else {
          toast.error("No valid sources found. Use: google_maps, google_search, bing_search, directory");
        }
      } else {
        toast.error("Invalid CSV. Download the template for the correct format.");
      }
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  }

  const isRunning =
    status?.status === "pending" || status?.status === "running";

  const allLeads = leads ?? [];
  const allMessages = messages ?? [];

  const totalLeads = allLeads.length;
  const emailsFound = allLeads.filter((l) => l.email).length;
  const drafts = allMessages.filter((m) => m.status === "draft").length;
  const approved = allMessages.filter((m) => m.status === "approved").length;
  const sent = allMessages.filter((m) => m.status === "sent").length;

  // Recent leads (last 5)
  const recentLeads = [...allLeads]
    .sort((a, b) => (b.scraped_at ?? "").localeCompare(a.scraped_at ?? ""))
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lead generation and outreach pipeline
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/leads">
            <Button variant="outline" size="sm">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              View Leads
            </Button>
          </Link>
          <Link href="/outreach">
            <Button size="sm">
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              Outreach
            </Button>
          </Link>
        </div>
      </div>

      {/* Key Metrics */}
      <div data-tour="metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Leads"
          value={totalLeads}
          icon={Users}
          loading={leadsLoading}
          accent="text-blue-400"
        />
        <MetricCard
          label="Emails Found"
          value={emailsFound}
          icon={Mail}
          loading={leadsLoading}
          subtitle={totalLeads > 0 ? `${Math.round((emailsFound / totalLeads) * 100)}% coverage` : undefined}
          accent="text-emerald-400"
        />
        <MetricCard
          label="Pending Drafts"
          value={drafts}
          icon={FileText}
          accent="text-amber-400"
        />
        <MetricCard
          label="Sent"
          value={sent}
          icon={Send}
          subtitle={approved > 0 ? `${approved} approved` : undefined}
          accent="text-sky-400"
        />
      </div>

      {/* Recent Leads */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent Leads</CardTitle>
            <Link
              href="/leads"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {leadsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : recentLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No leads yet. Run a scrape to get started.
            </p>
          ) : (
            <div className="space-y-1">
              {recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelectedLead(lead)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {lead.business_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {lead.venue_category && (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {lead.venue_category.replace(/_/g, " ")}
                        </span>
                      )}
                      {lead.score != null && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Score: {lead.score}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {lead.email && (
                      <Mail className="h-3 w-3 text-emerald-400" />
                    )}
                    <Badge
                      variant="secondary"
                      className="text-[9px] capitalize px-1.5 py-0"
                    >
                      {(lead.stage ?? "scraped").replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outreach Plan */}
      <OutreachPlan
        onLeadClick={(leadId) => {
          const lead = allLeads.find((l) => l.id === leadId) ?? null;
          if (lead) setSelectedLead(lead);
        }}
      />

      {/* Scrape Controls (admin only) */}
      {isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Scrape Controls</h2>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => csvInputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload Scrape Queries
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                CSV Template
              </Button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleCsvUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Uploaded queries preview */}
          {uploadedQueries && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-emerald-400">Queries uploaded — will be used on the next scrape</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Object.values(uploadedQueries).flat().length} queries across {Object.keys(uploadedQueries).length} source{Object.keys(uploadedQueries).length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploadedQueries(null)}
                    className="text-muted-foreground hover:text-foreground -mt-1"
                  >
                    Dismiss
                  </Button>
                </div>
                <div className="space-y-2">
                  {Object.entries(uploadedQueries).map(([source, queries]) => (
                    <div key={source}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {SOURCE_LABELS[source] ?? source} ({queries.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {queries.map((q, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] font-mono">
                            {q}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        <div data-tour="scrape-controls" className="grid gap-6 lg:grid-cols-2">
          <ScrapeControl
            onStart={(queries, limit, headless) =>
              startScrape({ queries, limit, headless })
            }
            isStarting={isStarting}
            isRunning={isRunning}
          />
          {status ? <ScrapeStatus status={status} /> : <ScrapeHistory />}
        </div>
        </div>
      )}
      <LeadDetailDialog
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MetricCard({
  label,
  value,
  icon: Icon,
  subtitle,
  loading,
  accent = "text-primary",
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  subtitle?: string;
  loading?: boolean;
  accent?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold tabular-nums tracking-tight">
                {value.toLocaleString()}
              </p>
            )}
            {subtitle && (
              <p className="text-[11px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={`rounded-lg bg-muted/50 p-2.5 ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
