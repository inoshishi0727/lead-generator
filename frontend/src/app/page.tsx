"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrapeControl } from "@/components/scrape-control";
import { ScrapeStatus } from "@/components/scrape-status";
import { OutreachPlan } from "@/components/outreach-plan";
import { useScrape } from "@/hooks/use-scrape";
import { useLeads } from "@/hooks/use-leads";
import { useMessages } from "@/hooks/use-outreach";
import {
  Users,
  Mail,
  FileText,
  CheckCheck,
  Send,
  ArrowRight,
  ChevronRight,
  Target,
  Zap,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const PIPELINE_STAGES = [
  { key: "scraped", label: "Scraped", color: "bg-zinc-500" },
  { key: "enriched", label: "Enriched", color: "bg-blue-500" },
  { key: "scored", label: "Scored", color: "bg-indigo-500" },
  { key: "draft_generated", label: "Drafted", color: "bg-amber-500" },
  { key: "approved", label: "Approved", color: "bg-emerald-500" },
  { key: "sent", label: "Sent", color: "bg-sky-500" },
  { key: "responded", label: "Responded", color: "bg-purple-500" },
  { key: "converted", label: "Converted", color: "bg-green-500" },
];

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const { startScrape, isStarting, status } = useScrape();
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: messages } = useMessages();

  const isRunning =
    status?.status === "pending" || status?.status === "running";

  const allLeads = leads ?? [];
  const allMessages = messages ?? [];

  const totalLeads = allLeads.length;
  const emailsFound = allLeads.filter((l) => l.email).length;
  const enriched = allLeads.filter((l) => l.enrichment_status === "success" || l.venue_category).length;
  const drafts = allMessages.filter((m) => m.status === "draft").length;
  const approved = allMessages.filter((m) => m.status === "approved").length;
  const sent = allMessages.filter((m) => m.status === "sent").length;

  // Pipeline counts
  const stageCounts: Record<string, number> = {};
  for (const stage of PIPELINE_STAGES) {
    stageCounts[stage.key] = allLeads.filter((l) => l.stage === stage.key).length;
  }
  const maxStageCount = Math.max(1, ...Object.values(stageCounts));

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Pipeline + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Pipeline funnel */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Pipeline</CardTitle>
              <Link
                href="/analytics"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Analytics
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {PIPELINE_STAGES.map((stage) => {
                const count = stageCounts[stage.key] ?? 0;
                const pct = (count / maxStageCount) * 100;
                return (
                  <div key={stage.key} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-muted-foreground text-right shrink-0">
                      {stage.label}
                    </span>
                    <div className="flex-1 h-6 rounded-md bg-muted/30 overflow-hidden">
                      <div
                        className={`h-full rounded-md ${stage.color} transition-all duration-500 flex items-center`}
                        style={{ width: `${Math.max(count > 0 ? 3 : 0, pct)}%` }}
                      >
                        {count > 0 && (
                          <span className="px-2 text-[11px] font-semibold text-white whitespace-nowrap">
                            {count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent leads */}
        <Card className="lg:col-span-2">
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
                    className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/30"
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
      </div>

      {/* Outreach Plan */}
      <OutreachPlan />

      {/* Scrape Controls (admin only) */}
      {isAdmin && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ScrapeControl
            onStart={(queries, limit, headless) =>
              startScrape({ queries, limit, headless })
            }
            isStarting={isStarting}
            isRunning={isRunning}
          />
          {status && <ScrapeStatus status={status} />}
        </div>
      )}
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
