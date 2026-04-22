"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import * as d3 from "d3";
import { BarChart3, Search, X, Reply, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useSubjectLineStats, useOpenRateTrend, useEmailsBySubject } from "@/hooks/use-analytics";
import { LeadPreviewModal } from "@/components/lead-preview-modal";
import type { SubjectLineStat } from "@/lib/types";
import type { BestPerformingEmail } from "@/lib/firestore-analytics";

const OPEN_COLOR = "#3b82f6";
const REPLY_COLOR = "#059669";

function MiniTrendChart({ series }: { series: { week: string; open_rate: number; reply_rate: number }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!series.length || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth ?? 400;
    const height = 100;
    const margin = { top: 8, right: 8, bottom: 20, left: 30 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scalePoint().domain(series.map((s) => s.week)).range([0, innerW]);
    const maxRate = d3.max(series, (s) => Math.max(s.open_rate, s.reply_rate)) || 0.1;
    const y = d3.scaleLinear().domain([0, Math.max(maxRate * 1.3, 0.05)]).range([innerH, 0]);

    function drawLine(accessor: (d: typeof series[0]) => number, color: string, delay: number) {
      const area = d3.area<typeof series[0]>()
        .x((d) => x(d.week)!).y0(innerH).y1((d) => y(accessor(d))).curve(d3.curveMonotoneX);
      g.append("path").datum(series).attr("d", area).attr("fill", color).attr("opacity", 0.06);

      const line = d3.line<typeof series[0]>()
        .x((d) => x(d.week)!).y((d) => y(accessor(d))).curve(d3.curveMonotoneX);
      const path = g.append("path").datum(series).attr("d", line)
        .attr("fill", "none").attr("stroke", color).attr("stroke-width", 1.5).attr("opacity", 0.8);

      const len = (path.node() as SVGPathElement)?.getTotalLength?.() ?? 0;
      if (len > 0) {
        path.attr("stroke-dasharray", len).attr("stroke-dashoffset", len)
          .transition().delay(delay).duration(900).attr("stroke-dashoffset", 0);
      }

      g.selectAll(`.dot-${color.replace("#", "")}`)
        .data(series).join("circle")
        .attr("cx", (d) => x(d.week)!).attr("cy", (d) => y(accessor(d)))
        .attr("r", 2).attr("fill", color).attr("opacity", 0.7);
    }

    drawLine((d) => d.open_rate, OPEN_COLOR, 0);
    drawLine((d) => d.reply_rate, REPLY_COLOR, 200);

    g.append("g").attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(6)
        .tickFormat((d, i) => (i % 3 === 0 ? String(d).slice(5) : "")))
      .selectAll("text").style("font-size", "8px").attr("opacity", 0.35);
    g.select(".domain").attr("opacity", 0.08);

    g.append("g")
      .call(d3.axisLeft(y).ticks(3).tickSize(0).tickPadding(4)
        .tickFormat((d) => `${Math.round((d as number) * 100)}%`))
      .selectAll("text").style("font-size", "8px").attr("opacity", 0.35);
    g.selectAll(".domain").attr("opacity", 0.08);

    const legend = g.append("g").attr("transform", `translate(${innerW - 120}, -4)`);
    [{ label: "Opens", color: OPEN_COLOR }, { label: "Replies", color: REPLY_COLOR }].forEach(({ label, color }, i) => {
      const row = legend.append("g").attr("transform", `translate(${i * 62}, 0)`);
      row.append("line").attr("x1", 0).attr("x2", 10).attr("y1", 0).attr("y2", 0)
        .attr("stroke", color).attr("stroke-width", 1.5);
      row.append("text").attr("x", 13).attr("y", 3).text(label)
        .style("font-size", "8px").attr("fill", "currentColor").attr("opacity", 0.45);
    });
  }, [series]);

  return <svg ref={svgRef} className="w-full" />;
}

function truncate(text: string, max = 40): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// Modal showing all emails sent with a specific subject line
function SubjectEmailsModal({
  subject,
  onClose,
}: {
  subject: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useEmailsBySubject(subject);
  const [preview, setPreview] = useState<BestPerformingEmail | null>(null);

  const emails = data ?? [];

  if (preview) {
    return (
      <LeadPreviewModal
        leadId={preview.lead_id}
        businessName={preview.business_name}
        onClose={() => setPreview(null)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-lg border border-border/50 bg-card shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Emails using this subject</h2>
            <p className="text-xs text-muted-foreground truncate mt-0.5">"{subject}"</p>
          </div>
          <button onClick={onClose} className="ml-3 shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto divide-y divide-border/40 flex-1">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : emails.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No emails found</p>
          ) : (
            emails.map((e, i) => (
              <button
                key={`${e.lead_id}-${i}`}
                onClick={() => setPreview(e)}
                className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{e.business_name}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-1">{e.content}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.reply_count > 0 && (
                      <div className="flex items-center gap-1 text-xs text-blue-400">
                        <Reply className="h-3 w-3" /><span>{e.reply_count}</span>
                      </div>
                    )}
                    {e.open_count > 0 && (
                      <div className="flex items-center gap-1 text-xs text-emerald-400">
                        <Eye className="h-3 w-3" /><span>{e.open_count}×</span>
                      </div>
                    )}
                    {e.venue_category && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">{e.venue_category}</Badge>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// "See all" modal — React list instead of D3 so rows are clickable
function SubjectModal({
  subjects,
  onClose,
}: {
  subjects: SubjectLineStat[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return subjects;
    const q = search.toLowerCase();
    return subjects.filter((s) => s.subject.toLowerCase().includes(q));
  }, [subjects, search]);

  const maxOpenRate = useMemo(() => Math.max(...filtered.map((s) => s.open_rate), 1), [filtered]);

  if (selectedSubject) {
    return <SubjectEmailsModal subject={selectedSubject} onClose={() => setSelectedSubject(null)} />;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-border/50 bg-card shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Subject Line Performance ({subjects.length})
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search subject lines..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-border/30">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No results</p>
          ) : (
            filtered.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelectedSubject(s.subject)}
                className="w-full text-left px-4 py-2.5 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[10px] text-muted-foreground/40 shrink-0 w-4 text-right">{i + 1}</span>
                  <span className="text-xs font-medium truncate flex-1">{s.subject}</span>
                  <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono">
                    <span className="text-emerald-400">{s.open_rate.toFixed(1)}% open</span>
                    <span className="text-blue-400">{s.reply_rate.toFixed(1)}% reply</span>
                    <span className="text-muted-foreground/50">{s.sent} sent</span>
                  </div>
                </div>
                {/* CSS bar */}
                <div className="ml-6 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500/50 transition-all"
                    style={{ width: `${(s.open_rate / maxOpenRate) * 100}%` }}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function SubjectLineChart() {
  const { data, isLoading } = useSubjectLineStats();
  const { data: trendData } = useOpenRateTrend();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const series = trendData?.series ?? [];

  const subjects: SubjectLineStat[] = useMemo(() => {
    const raw = Array.isArray(data) ? data : (data as any)?.subjects ?? [];
    return [...raw].sort((a: SubjectLineStat, b: SubjectLineStat) =>
      b.open_rate - a.open_rate || b.reply_rate - a.reply_rate
    );
  }, [data]);

  const top5 = subjects.slice(0, 5);
  const totalSent = subjects.reduce((s, x) => s + x.sent, 0);
  const totalOpened = subjects.reduce((s, x) => s + x.opened, 0);
  const avgOpenRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Subject Line Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Subject Line Performance
            </CardTitle>
            {subjects.length > 0 && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setModalOpen(true)}>
                See all {subjects.length}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          {subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sent messages yet.</p>
          ) : (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-3xl font-bold">{subjects.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">subject lines tracked</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-emerald-400">{avgOpenRate}%</p>
                  <p className="text-xs text-muted-foreground mt-0.5">avg open rate</p>
                </div>
              </div>

              {/* Trend chart */}
              {series.length > 0 && <MiniTrendChart series={series} />}

              {/* Top 5 preview — clickable */}
              <div className="divide-y divide-border/30">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                  <span>Subject</span>
                  <span className="w-12 text-right">Open</span>
                  <span className="w-12 text-right">Reply</span>
                </div>
                {top5.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedSubject(s.subject)}
                    className="w-full text-left grid grid-cols-[1fr_auto_auto] gap-3 py-1.5 items-center hover:bg-muted/30 rounded px-1 -mx-1 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">{i + 1}</span>
                      <span className="text-xs truncate">{s.subject}</span>
                    </div>
                    <span className={`text-xs font-medium w-12 text-right ${s.open_rate > 30 ? "text-emerald-400" : ""}`}>
                      {s.open_rate.toFixed(1)}%
                    </span>
                    <span className={`text-xs font-medium w-12 text-right ${s.reply_rate > 10 ? "text-blue-400" : ""}`}>
                      {s.reply_rate.toFixed(1)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {modalOpen && <SubjectModal subjects={subjects} onClose={() => setModalOpen(false)} />}
      {selectedSubject && !modalOpen && (
        <SubjectEmailsModal subject={selectedSubject} onClose={() => setSelectedSubject(null)} />
      )}
    </>
  );
}
