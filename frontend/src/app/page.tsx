"use client";

import { useState, useRef, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrapeControl } from "@/components/scrape-control";
import { ScrapeHistory } from "@/components/scrape-history";
import { ScrapeStatus } from "@/components/scrape-status";
import { UpcomingScrapeReview } from "@/components/upcoming-scrape-review";
import { OutreachPlan } from "@/components/outreach-plan";
import { LeadDetailDialog } from "@/components/lead-detail-dialog";
import { useScrape } from "@/hooks/use-scrape";
import { useLeads } from "@/hooks/use-leads";
import { useMessages } from "@/hooks/use-outreach";
import { Upload, Download, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { EditReflectionBanner } from "@/components/edit-reflection-banner";
import { ScrapeRunningBanner } from "@/components/pipeline-activity";
import { useImportQueries, type SearchQueries } from "@/hooks/use-search-queries";
import { toast } from "sonner";
import { Sparkline } from "@/components/ui/sparkline";
import { FitScore } from "@/components/ui/fit-score";
import { StageChip } from "@/components/ui/stage-chip";
import { PersonAvatar } from "@/components/ui/person-avatar";
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

function stageFor(lead: Lead): "new" | "contacted" | "replied" | "converted" | "rejected" {
  if (lead.outcome === "converted") return "converted";
  if (lead.outcome === "lost" || lead.outcome === "not_interested") return "rejected";
  if ((lead.reply_count ?? 0) > 0) return "replied";
  if (lead.stage === "contacted" || (lead.open_count ?? 0) > 0) return "contacted";
  return "new";
}

export default function DashboardPage() {
  const { isAdmin, isMember, user } = useAuth();
  const { startScrape, isStarting, status } = useScrape();
  const assignedTo = isMember ? user?.uid : undefined;
  const { data: leads, isLoading: leadsLoading } = useLeads({ assignedTo });
  const { data: messages } = useMessages({ assignedTo } as any);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const importMutation = useImportQueries();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [uploadedQueries, setUploadedQueries] = useState<Record<string, string[]> | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [isScraping, setIsScraping] = useState(false);

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
      .slice(0, 5),
    [allLeads]
  );

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

  function triggerScrapeAnimation() {
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

      {/* Hot new leads */}
      <div className="sp-card" style={{ marginBottom: 16 }}>
        <div className="sp-card-head">
          <span className="sp-card-title">Hot new leads</span>
          <span className="sp-card-subtitle">Highest scores · awaiting first contact</span>
          <span className="sp-spacer" />
          <Link href="/leads">
            <button className="sp-btn sm ghost">All leads →</button>
          </Link>
        </div>
        <table className="sp-tbl">
          <thead>
            <tr>
              <th>Venue</th>
              <th>Category</th>
              <th>Postcode</th>
              <th>Score</th>
              <th>Assigned</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leadsLoading ? (
              <tr>
                <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--sp-ink-3)" }}>
                  Loading…
                </td>
              </tr>
            ) : hotLeads.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--sp-ink-3)" }}>
                  No high-score new leads yet.
                </td>
              </tr>
            ) : (
              hotLeads.map((l) => (
                <tr key={l.id} onClick={() => setSelectedLead(l)}>
                  <td className="col-name">
                    <span style={{ color: "var(--sp-ink-4)", fontFamily: "var(--font-mono, monospace)", fontSize: 11, marginRight: 8 }}>
                      {l.id.slice(-4)}
                    </span>
                    {l.business_name}
                  </td>
                  <td style={{ color: "var(--sp-ink-2)" }}>
                    {l.venue_category?.replace(/_/g, " ") ?? "—"}
                  </td>
                  <td className="sp-mono" style={{ color: "var(--sp-ink-2)" }}>
                    {l.location_postcode ?? "—"}
                  </td>
                  <td>
                    <FitScore score={l.score ?? 0} />
                  </td>
                  <td>
                    {l.assigned_to_name ? (
                      <div className="sp-row" style={{ gap: 6 }}>
                        <PersonAvatar name={l.assigned_to_name} size={20} />
                        {l.assigned_to_name}
                      </div>
                    ) : (
                      <span className="sp-muted">Unassigned</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link href="/outreach">
                      <button className="sp-btn sm" onClick={(e) => e.stopPropagation()}>
                        Draft email
                      </button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
