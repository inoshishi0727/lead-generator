"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import * as d3 from "d3";
import { Eye, Reply, Clock, Search, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopOpeners, useOpenRateTrend } from "@/hooks/use-analytics";
import { LeadPreviewModal } from "@/components/lead-preview-modal";
import type { TopOpener } from "@/lib/types";

const OPEN_COLOR = "#3b82f6";
const REPLY_COLOR = "#059669";

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

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

    // Legend
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

function OpenerRow({ o, onClick }: { o: TopOpener; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 ${onClick ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{o.business_name}</p>
        {o.subject && <p className="text-xs text-muted-foreground truncate">{o.subject}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {o.has_reply && (
          <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400 px-1.5 py-0">
            <Reply className="h-2.5 w-2.5 mr-0.5" /> replied
          </Badge>
        )}
        <div className="flex items-center gap-1 text-xs text-emerald-400 w-10 justify-end">
          <Eye className="h-3 w-3" /><span>{o.open_count}×</span>
        </div>
        {o.last_opened_at && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground w-16 justify-end">
            <Clock className="h-3 w-3" /><span>{timeAgo(o.last_opened_at)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function OpenerModal({ openers, onClose }: { openers: TopOpener[]; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<TopOpener | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return openers;
    const q = search.toLowerCase();
    return openers.filter((o) => o.business_name.toLowerCase().includes(q) || (o.subject ?? "").toLowerCase().includes(q));
  }, [openers, search]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-lg border border-border/50 bg-card shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Eye className="h-4 w-4" /> Who Opened ({openers.length})
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input type="text" placeholder="Search by name or subject..." value={search}
              onChange={(e) => setSearch(e.target.value)} autoFocus
              className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm" />
          </div>
        </div>
        <div className="overflow-y-auto divide-y divide-border/40 flex-1">
          {filtered.length === 0
            ? <p className="px-4 py-6 text-sm text-muted-foreground text-center">No results</p>
            : filtered.map((o, i) => <OpenerRow key={`${o.lead_id}-${i}`} o={o} onClick={() => setPreview(o)} />)}
        </div>
      </div>
    </div>
  );
}

export function EmailOpensCard() {
  const { data, isLoading } = useTopOpeners();
  const { data: trendData, isLoading: trendLoading } = useOpenRateTrend();
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState<TopOpener | null>(null);

  const openers = data ?? [];
  const totalOpens = openers.reduce((sum, o) => sum + o.open_count, 0);
  const replied = openers.filter((o) => o.has_reply).length;
  const series = trendData?.series ?? [];

  if (isLoading || trendLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Eye className="h-4 w-4" /> Email Opens
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-28 w-full" />
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
              <Eye className="h-4 w-4" /> Email Opens
            </CardTitle>
            {openers.length > 0 && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setModalOpen(true)}>
                See who opened
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          {openers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No opens tracked yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-3xl font-bold">{openers.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">contacts opened</p>
                </div>
                <div>
                  <p className="text-xl font-semibold">{totalOpens}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">total opens</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-blue-400">{replied}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">also replied</p>
                </div>
              </div>
              {series.length > 0 && <MiniTrendChart series={series} />}

              {/* Recent openers preview */}
              <div className="divide-y divide-border/30">
                {openers.slice(0, 5).map((o, i) => (
                  <button
                    key={`${o.lead_id}-${i}`}
                    onClick={() => setPreview(o)}
                    className="w-full text-left flex items-center gap-2 py-1.5 hover:bg-muted/30 rounded px-1 -mx-1 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium truncate">{o.business_name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {o.has_reply && (
                        <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400 px-1 py-0">
                          <Reply className="h-2.5 w-2.5 mr-0.5" />replied
                        </Badge>
                      )}
                      <span className="text-xs text-emerald-400">{o.open_count}×</span>
                      <span className="text-[10px] text-muted-foreground/50 w-12 text-right">{timeAgo(o.last_opened_at)}</span>
                    </div>
                  </button>
                ))}
                {openers.length > 5 && (
                  <p className="text-[10px] text-muted-foreground/50 pt-1.5">+{openers.length - 5} more</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {modalOpen && <OpenerModal openers={openers} onClose={() => setModalOpen(false)} />}
      {preview && !modalOpen && (
        <LeadPreviewModal
          leadId={preview.lead_id}
          businessName={preview.business_name}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
