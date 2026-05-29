"use client";

import { useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrapeControl } from "@/components/scrape-control";
import { ScrapeHistory } from "@/components/scrape-history";
import { ScrapeStatus } from "@/components/scrape-status";
import { UpcomingScrapeReview } from "@/components/upcoming-scrape-review";
import { OutreachPlan } from "@/components/outreach-plan";
import { LeadDetailDialog } from "@/components/lead-detail-dialog";
import { ActionableLeadCard } from "@/components/actionable-lead-card";
import { AddSpecificVenue } from "@/components/add-specific-venue";
import { BulkAddVenues } from "@/components/bulk-add-venues";
import { useScrape } from "@/hooks/use-scrape";
import { useLeads } from "@/hooks/use-leads";
import { useMessages, useGenerateDrafts } from "@/hooks/use-outreach";
import { useOutreachPlan, type OutreachLead } from "@/hooks/use-outreach-plan";
import { Upload, Download, RefreshCw, Sparkles, Target, FileText, Send, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { EditReflectionBanner } from "@/components/edit-reflection-banner";
import { ScrapeRunningBanner } from "@/components/pipeline-activity";
import { useImportQueries, type SearchQueries } from "@/hooks/use-search-queries";
import { toast } from "sonner";
import { Sparkline } from "@/components/ui/sparkline";
import { StageChip } from "@/components/ui/stage-chip";
import type { Lead, OutreachMessage } from "@/lib/types";

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

function stageFor(lead: Lead): "new" | "contacted" | "replied" | "converted" | "rejected" {
  if (lead.outcome === "converted") return "converted";
  if (lead.outcome === "lost" || lead.outcome === "not_interested") return "rejected";
  if ((lead.reply_count ?? 0) > 0) return "replied";
  if (lead.stage === "contacted" || (lead.open_count ?? 0) > 0) return "contacted";
  return "new";
}

export default function DashboardPage() {
  const { isAdmin, isMember, user } = useAuth();
  const router = useRouter();
  const { startScrape, isStarting, status } = useScrape();
  const assignedTo = isMember ? user?.uid : undefined;
  const { data: leads, isLoading: leadsLoading } = useLeads({ assignedTo });
  const { data: messages } = useMessages({ assignedTo } as any);
  const { data: outreachPlan } = useOutreachPlan(10);
  const generateMutation = useGenerateDrafts();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [actionPendingLead, setActionPendingLead] = useState<string | null>(null);
  const importMutation = useImportQueries();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [uploadedQueries, setUploadedQueries] = useState<Record<string, string[]> | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [isScraping, setIsScraping] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);

  const isRunning = status?.status === "pending" || status?.status === "running";

  const allLeads = leads ?? [];
  const allMessages = messages ?? [];

  const totalLeads = allLeads.length;
  const emailsFound = allLeads.filter((l) => l.email).length;
  const drafts = allMessages.filter((m) => m.status === "draft").length;
  const approved = allMessages.filter((m) => m.status === "approved").length;
  const sent = allMessages.filter((m) => m.status === "sent").length;
  const replies = allLeads.filter((l) => (l.reply_count ?? 0) > 0).length;
  const replyRate = sent > 0 ? ((replies / sent) * 100).toFixed(1) : "0.0";

  const pipeline = useMemo(() => {
    const counts = { new: 0, contacted: 0, replied: 0, converted: 0, rejected: 0 };
    allLeads.forEach((l) => { counts[stageFor(l)]++; });
    return counts;
  }, [allLeads]);

  const hotLeads = useMemo(() =>
    [...allLeads]
      .filter((l) => stageFor(l) === "new" && (l.score ?? 0) >= 7)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10),
    [allLeads]
  );

  // Join the eligible plan against the latest message per lead to decide whether
  // each row needs "generate" / "send" / "contacted" — same logic as Outreach overview.
  const actionableLeads = useMemo(() => {
    if (!outreachPlan) return [];
    const msgMap = new Map<string, OutreachMessage>();
    for (const m of allMessages) {
      if (!msgMap.has(m.lead_id)) msgMap.set(m.lead_id, m);
    }
    const results: { lead: OutreachLead; action: "generate" | "send" | "contacted"; messageId?: string }[] = [];
    for (const lead of outreachPlan.recommended) {
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
  }, [outreachPlan, allMessages]);

  const actionableHotLeads = useMemo(() => {
    const msgMap = new Map<string, OutreachMessage>();
    for (const m of allMessages) {
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
  }, [hotLeads, allMessages]);

  function gotoOutreach(leadId: string, status: "draft" | "approved") {
    router.push(`/outreach?tab=${status}&lead=${leadId}`);
  }

  function handleEligibleAction(lead: OutreachLead, action: "generate" | "send", messageId?: string) {
    if (action === "generate") {
      setActionPendingLead(lead.lead_id);
      generateMutation.mutate([lead.lead_id], {
        onSettled: () => setActionPendingLead(null),
        onSuccess: () => gotoOutreach(lead.lead_id, "draft"),
      });
    } else {
      const msg = allMessages.find((m) => m.id === messageId);
      gotoOutreach(lead.lead_id, msg?.status === "approved" ? "approved" : "draft");
    }
  }

  function handleHotAction(lead: Lead, action: "generate" | "send", messageId?: string) {
    if (action === "generate") {
      setActionPendingLead(lead.id);
      generateMutation.mutate([lead.id], {
        onSettled: () => setActionPendingLead(null),
        onSuccess: () => gotoOutreach(lead.id, "draft"),
      });
    } else {
      const msg = allMessages.find((m) => m.id === messageId);
      gotoOutreach(lead.id, msg?.status === "approved" ? "approved" : "draft");
    }
  }

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

  // Default queries used by the top-level "Run venue scrape" button.
  // Kept small to stay well clear of the VPS OOM threshold. For larger /
  // category-targeted scrapes, use the Scrape Controls section lower down.
  const QUICK_SCRAPE_QUERIES = [
    "cocktail bars London",
    "wine bar Manchester",
    "gastropub Edinburgh",
  ];
  const QUICK_SCRAPE_LIMIT = 10;

  function triggerScrapeAnimation() {
    if (isRunning || isStarting) {
      toast.info("A scrape is already running. Wait for it to finish.");
      return;
    }
    startScrape({ queries: QUICK_SCRAPE_QUERIES, limit: QUICK_SCRAPE_LIMIT, headless: true });
    // Local animation runs alongside until the polled `status` flips to
    // "running" and the spinner is driven by `isRunning` instead.
    setIsScraping(true);
    setScrapeProgress(0);
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / 3200, 1);
      setScrapeProgress(p);
      if (p < 1) requestAnimationFrame(tick);
      else setTimeout(() => setIsScraping(false), 800);
    };
    requestAnimationFrame(tick);
  }

  const STAGE_COLORS: Record<string, string> = {
    new: "oklch(0.6 0.1 230)",
    contacted: "oklch(0.5 0.1 290)",
    replied: "oklch(0.65 0.13 75)",
    converted: "oklch(0.55 0.13 150)",
    rejected: "oklch(0.58 0.18 25)",
  };
  const pipelineStages = ["new", "contacted", "replied", "converted", "rejected"] as const;
  const pipelineMax = Math.max(...pipelineStages.map((s) => pipeline[s]), 1);

  const today = new Date();
  const dayName = today.toLocaleDateString("en-GB", { weekday: "long" });
  const firstSentAt = allMessages
    .filter((m) => m.sent_at)
    .map((m) => new Date(m.sent_at as string).getTime())
    .reduce((min, t) => (t < min ? t : min), Infinity);
  const opsStart = isFinite(firstSentAt) ? new Date(firstSentAt) : null;
  const weekNum = opsStart
    ? Math.max(1, Math.ceil((today.getTime() - opsStart.getTime()) / (7 * 24 * 60 * 60 * 1000)))
    : 1;

  return (
    <div className="sp-page">
      {/* Page header */}
      <div className="sp-page-head">
        <div>
          <h1 className="sp-page-title">
            {dayName}
            <span style={{ fontStyle: "italic", color: "var(--sp-ink-3)" }}>, week {weekNum}</span>
          </h1>
          <div className="sp-page-subtitle">
            {totalLeads} leads in pipeline.{" "}
            {approved > 0 ? `${approved} email${approved !== 1 ? "s" : ""} awaiting approval.` : "All caught up on approvals."}
          </div>
        </div>
        <div className="sp-page-actions">
          {approved > 0 && (
            <Link href="/outreach">
              <button className="sp-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
                {approved} pending
              </button>
            </Link>
          )}
          {isAdmin && <AddSpecificVenue />}
          {isAdmin && (
            <button
              type="button"
              className="sp-btn"
              onClick={() => setBulkAddOpen(true)}
              title="Add a list of venues at once"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              Bulk add
            </button>
          )}
          {isAdmin && (
            <button
              className={`sp-btn${isRunning || isScraping ? "" : " primary"}`}
              onClick={triggerScrapeAnimation}
              disabled={isRunning || isScraping}
            >
              {isScraping || isRunning ? (
                <>
                  <RefreshCw size={13} className="sp-spin" />
                  Scraping… {Math.round(scrapeProgress * 100)}%
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l6 6M20 4l-6 6M4 20l6-6M20 20l-6-6"/><circle cx="12" cy="12" r="3"/></svg>
                  Run venue scrape
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Live scrape / scraping animation banners */}
      {(isScraping || isRunning) && (
        <div className="sp-scrape-banner">
          <div className="sp-row" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 500 }}>Scraping venues across postcodes</span>
            <span className="sp-spacer" />
            <span className="sp-mono sp-muted">{Math.round(scrapeProgress * 184)} / 184 sources</span>
          </div>
          <div className="sp-progress-track">
            <div className="sp-progress-fill" style={{ width: `${scrapeProgress * 100}%` }} />
          </div>
        </div>
      )}

      <ScrapeRunningBanner />
      <EditReflectionBanner />

      {/* Stat cards */}
      <div className="sp-grid-4" style={{ marginBottom: 16 }}>
        <StatCard
          label="Total leads"
          value={leadsLoading ? null : totalLeads}
          delta={emailsFound > 0 ? `${emailsFound} with email` : undefined}
        />
        <StatCard
          label="Emails sent"
          value={sent}
          delta={approved > 0 ? `${approved} approved` : "all sent"}
        />
        <StatCard
          label="Reply rate"
          value={replyRate}
          unit="%"
          delta={`${replies} replies`}
        />
        <StatCard
          label="Pending approval"
          value={drafts + approved}
          delta={approved > 0 ? "action needed" : "on target"}
          warn={approved > 6}
        />
      </div>

      {/* AI Weekly Plan */}
      <div style={{ marginBottom: 16 }}>
        <OutreachPlan
          onLeadClick={(leadId) => {
            const lead = allLeads.find((l) => l.id === leadId) ?? null;
            if (lead) setSelectedLead(lead);
          }}
        />
      </div>

      {/* Pipeline + Team */}
      <div className="sp-grid-2" style={{ marginBottom: 16 }}>
        <div className="sp-card">
          <div className="sp-card-head">
            <span className="sp-card-title">Pipeline</span>
            <span className="sp-card-subtitle">{totalLeads} leads across 5 stages</span>
            <span className="sp-spacer" />
            <Link href="/analytics">
              <button className="sp-btn sm ghost">View funnel →</button>
            </Link>
          </div>
          <div className="sp-card-body">
            <div className="sp-pipeline">
              {pipelineStages.map((s) => (
                <div key={s} className="sp-pipeline-col">
                  <div className="sp-pipeline-count">{pipeline[s]}</div>
                  <div
                    className="sp-pipeline-bar"
                    style={{
                      height: `${(pipeline[s] / pipelineMax) * 110}px`,
                      background: STAGE_COLORS[s],
                    }}
                  />
                  <div className="sp-pipeline-label" style={{ textTransform: "capitalize" }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sp-card">
          <div className="sp-card-head">
            <span className="sp-card-title">Email performance</span>
          </div>
          <div className="sp-card-body" style={{ paddingTop: 4 }}>
            <div className="sp-team-row" style={{ color: "var(--sp-ink-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500, borderBottom: "1px solid var(--sp-line)" }}>
              <span>Status</span>
              <span className="sp-mono" style={{ textAlign: "right" }}>Count</span>
              <span className="sp-mono" style={{ textAlign: "right" }}>—</span>
              <span className="sp-mono" style={{ textAlign: "right" }}>—</span>
              <span style={{ textAlign: "right" }}>—</span>
            </div>
            {[
              { label: "Drafts", val: drafts, color: "var(--sp-ink-3)" },
              { label: "Approved", val: approved, color: "var(--sp-warn)" },
              { label: "Sent", val: sent, color: "var(--sp-info)" },
              { label: "Replies", val: replies, color: "var(--sp-good)" },
            ].map((row) => (
              <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr 70px", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--sp-line)", fontSize: 12.5, color: "var(--sp-ink)" }}>
                <span>{row.label}</span>
                <span style={{ fontFamily: "var(--font-mono, monospace)", textAlign: "right", fontWeight: 600, color: row.color }}>{row.val}</span>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px", alignItems: "center", padding: "8px 0", fontSize: 12.5, color: "var(--sp-ink)" }}>
              <span>Reply rate</span>
              <span style={{ fontFamily: "var(--font-mono, monospace)", textAlign: "right", fontWeight: 600, color: "var(--sp-good)" }}>{replyRate}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 10 Eligible Leads */}
      <div className="sp-card" style={{ marginBottom: 16 }}>
        <div className="sp-card-head">
          <span className="sp-card-title" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Sparkles className="h-4 w-4 text-purple-400" />
            Top 10 Eligible Leads
          </span>
          <span className="sp-card-subtitle">
            {outreachPlan?.total_eligible ? `${outreachPlan.total_eligible} total eligible` : "Highest-priority leads ready for outreach"}
          </span>
          <span className="sp-spacer" />
          <Link href="/outreach?tab=overview">
            <button className="sp-btn sm ghost">Open Outreach →</button>
          </Link>
        </div>
        <div style={{ padding: 12 }}>
          {!outreachPlan ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : actionableLeads.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--sp-ink-3)", padding: "12px 4px" }}>
              No eligible leads for outreach. Scrape and enrich leads first.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {actionableLeads.map(({ lead, action, messageId }, i) => (
                <ActionableLeadCard
                  key={lead.lead_id}
                  lead={lead}
                  rank={i + 1}
                  action={action}
                  messageId={messageId}
                  onAction={handleEligibleAction}
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
      </div>

      {/* Top 10 Hot New Leads */}
      <div className="sp-card" style={{ marginBottom: 16 }}>
        <div className="sp-card-head">
          <span className="sp-card-title" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Target className="h-4 w-4 text-amber-400" />
            Top 10 Hot New Leads
          </span>
          <span className="sp-card-subtitle">Score ≥ 7 · awaiting first contact</span>
          <span className="sp-spacer" />
          <Link href="/leads">
            <button className="sp-btn sm ghost">All leads →</button>
          </Link>
        </div>
        <div style={{ padding: 12 }}>
          {leadsLoading ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : actionableHotLeads.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--sp-ink-3)", padding: "12px 4px" }}>
              No high-score new leads yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {actionableHotLeads.map(({ lead, action, messageId }, i) => (
                <div
                  key={lead.id}
                  className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/10 p-3 transition-colors hover:bg-muted/20"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[11px] font-bold text-amber-500">
                    {i + 1}
                  </span>
                  <div
                    className="flex-1 min-w-0 space-y-1 cursor-pointer"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{lead.business_name}</span>
                      <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                        {lead.venue_category?.replace(/_/g, " ") ?? "—"}
                      </Badge>
                      <span
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "1px 6px", borderRadius: 9999, fontSize: 10, fontWeight: 600,
                          background: (lead.score ?? 0) >= 8 ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                          color: (lead.score ?? 0) >= 8 ? "#22c55e" : "#f59e0b",
                        }}
                      >
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
                        <div
                          style={{
                            width: 16, height: 16, borderRadius: "50%",
                            background: "var(--sp-line-strong)", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: 8, fontWeight: 600, color: "var(--sp-ink-2)",
                          }}
                        >
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleHotAction(lead, action as "generate" | "send", messageId);
                        }}
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

      {/* Admin: Scrape Controls */}
      {isAdmin && (
        <div className="sp-card" style={{ marginBottom: 16 }}>
          <div className="sp-card-head">
            <span className="sp-card-title">Scrape Controls</span>
            <span className="sp-spacer" />
            <button
              className="sp-btn sm"
              onClick={() => csvInputRef.current?.click()}
            >
              <Upload size={12} />
              Upload Queries
            </button>
            <button className="sp-btn sm" onClick={downloadTemplate}>
              <Download size={12} />
              CSV Template
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleCsvUpload}
              className="hidden"
            />
          </div>
          <div className="sp-card-body">
            <UpcomingScrapeReview />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 16 }}>
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
        </div>
      )}

      <LeadDetailDialog
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />

      <BulkAddVenues open={bulkAddOpen} onClose={() => setBulkAddOpen(false)} />
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  delta,
  warn,
}: {
  label: string;
  value: number | string | null;
  unit?: string;
  delta?: string;
  warn?: boolean;
}) {
  return (
    <div className="sp-stat">
      <div className="sp-stat-label">{label}</div>
      <div className="sp-stat-value">
        {value === null ? (
          <span style={{ fontSize: 18, color: "var(--sp-ink-4)" }}>—</span>
        ) : (
          <>
            {typeof value === "number" ? value.toLocaleString() : value}
            {unit && <span className="unit">{unit}</span>}
          </>
        )}
      </div>
      {delta && (
        <div className={`sp-stat-delta${warn ? " down" : ""}`}>
          {delta}
        </div>
      )}
    </div>
  );
}
