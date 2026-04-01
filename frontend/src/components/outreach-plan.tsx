"use client";

import {
  Calendar,
  Clock,
  Flame,
  Loader2,
  Mail,
  Play,
  Search,
  Sparkles,
  Sun,
  Snowflake,
  Leaf,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useOutreachPlan, type OutreachLead } from "@/hooks/use-outreach-plan";
import { useScrape } from "@/hooks/use-scrape";

const SEASON_ICONS: Record<string, React.ElementType> = {
  spring_summer: Sun,
  high_summer: Flame,
  autumn_winter: Leaf,
  january: Snowflake,
};

const FIT_COLORS: Record<string, string> = {
  strong: "text-emerald-400",
  moderate: "text-amber-400",
  weak: "text-zinc-500",
  unknown: "text-zinc-600",
};

function LeadRow({ lead, rank, onClick }: { lead: OutreachLead; rank: number; onClick?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/10 p-3 transition-colors hover:bg-muted/20 cursor-pointer" onClick={onClick}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
        {rank}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{lead.business_name}</span>
          <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
            {lead.venue_category.replace(/_/g, " ")}
          </Badge>
          {lead.menu_fit && (
            <span className={`text-[10px] font-medium ${FIT_COLORS[lead.menu_fit]}`}>
              {lead.menu_fit}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {lead.lead_products.map((p) => (
            <Badge key={p} variant="outline" className="text-[9px] font-mono h-4">
              {p}
            </Badge>
          ))}
        </div>
        {lead.reasons.length > 0 && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {lead.reasons[0]}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {lead.contact_name && (
          <p className="text-[10px] text-muted-foreground">{lead.contact_name}</p>
        )}
        {lead.email ? (
          <a
            href={`mailto:${lead.email}`}
            className="text-[10px] text-primary hover:underline flex items-center gap-0.5 justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <Mail className="h-2.5 w-2.5" />
            {lead.email.length > 25 ? lead.email.slice(0, 25) + "..." : lead.email}
          </a>
        ) : (
          <span className="text-[10px] text-zinc-500 flex items-center gap-0.5 justify-end">
            <Mail className="h-2.5 w-2.5" />
            No email yet
          </span>
        )}
      </div>
    </div>
  );
}

export function OutreachPlan({ onLeadClick }: { onLeadClick?: (leadId: string) => void }) {
  const { data, isLoading, error } = useOutreachPlan(10);
  const { startScrape, isStarting } = useScrape();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>This Week's Outreach</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>This Week's Outreach</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-red-400">Failed to load outreach plan. The cloud function may need redeployment.</p>
          <p className="text-xs text-muted-foreground mt-1">{String(error)}</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.recommended.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>This Week's Outreach</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No eligible leads for outreach. Scrape and enrich leads first.</p>
        </CardContent>
      </Card>
    );
  }

  const SeasonIcon = SEASON_ICONS[data.season] ?? Sun;
  const progress = data.weekly_progress;
  const progressPct = Math.min(100, Math.round((progress.total / data.weekly_target) * 100));
  const scrapeRecs: { category: string; priority: number; current: number; target: number; gap: number; suggested_leads: number; queries: string[]; reason: string }[] = [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-purple-400" />
          This Week's Outreach
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Weekly progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Target className="h-3 w-3" />
              Weekly target
            </span>
            <span className="font-mono font-medium">
              {progress.total} / {data.weekly_target}
              <span className="text-muted-foreground ml-1">(enriched + contactable)</span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                progressPct >= 100 ? "bg-emerald-500" : progressPct >= 60 ? "bg-primary" : "bg-amber-500"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {progress.remaining > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {progress.remaining} more leads needed this week
            </p>
          )}
        </div>

        {/* Scrape recommendations */}
        {scrapeRecs.length > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                <Search className="h-3 w-3" />
                Recommended scrapes to hit {data.weekly_target}
              </p>
              <Button
                size="sm"
                className="h-6 px-2.5 text-[10px] bg-amber-600 hover:bg-amber-700 text-white"
                disabled={isStarting}
                onClick={() => {
                  const allQueries = scrapeRecs.flatMap((r) =>
                    r.queries.map((q) => q + " London")
                  );
                  const totalLeads = scrapeRecs.reduce((sum, r) => sum + r.suggested_leads, 0);
                  startScrape({
                    queries: allQueries,
                    limit: totalLeads,
                    headless: true,
                  });
                }}
              >
                {isStarting ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />
                ) : (
                  <Play className="h-2.5 w-2.5 mr-1" />
                )}
                Run All
              </Button>
            </div>
            {scrapeRecs.map((rec) => (
              <div key={rec.category} className="flex items-center gap-2 text-xs">
                <Badge variant="secondary" className="text-[9px] capitalize shrink-0">
                  {rec.category.replace(/_/g, " ")}
                </Badge>
                <span className="text-muted-foreground flex-1 truncate">{rec.reason}</span>
                <span className="font-mono font-medium text-amber-400 shrink-0">
                  +{rec.suggested_leads}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px] shrink-0 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  disabled={isStarting}
                  onClick={() =>
                    startScrape({
                      queries: rec.queries.map((q) => q + " London"),
                      limit: rec.suggested_leads,
                      headless: true,
                    })
                  }
                >
                  {isStarting ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <Play className="h-2.5 w-2.5 mr-0.5" />
                  )}
                  Run
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* AI weekly focus summary */}
        {data.ai_summary && (
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-purple-400 mb-1.5">
              <Sparkles className="h-3 w-3" />
              Weekly Focus
            </p>
            <p className="text-sm leading-relaxed text-foreground/90">
              {data.ai_summary}
            </p>
          </div>
        )}

        {/* Season + timing header */}
        <div className="flex flex-wrap gap-3 rounded-lg bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-xs">
            <SeasonIcon className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-muted-foreground">Season:</span>
            <span className="font-medium capitalize">{data.season.replace(/_/g, " ")}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-muted-foreground">Hook:</span>
            <span className="font-medium">{data.seasonal_hook}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="h-3.5 w-3.5 text-green-400" />
            <span className="text-muted-foreground">Send:</span>
            <span className={`font-medium ${data.send_window.status === "now" ? "text-emerald-400" : ""}`}>
              {data.send_window.label}
            </span>
          </div>
        </div>

        {/* Seasonal products */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Lead with:</span>
          <div className="flex gap-1">
            {data.seasonal_products.map((p) => (
              <Badge key={p} variant="outline" className="text-[9px] font-mono">
                {p}
              </Badge>
            ))}
          </div>
        </div>

        {/* Lead list */}
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Top {data.recommended.length} of {data.total_eligible} eligible leads, ranked by seasonal fit + enrichment quality
          </p>
          {data.recommended.map((lead, i) => (
            <LeadRow key={lead.lead_id} lead={lead} rank={i + 1} onClick={() => onLeadClick?.(lead.lead_id)} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
