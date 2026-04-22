"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import * as d3 from "d3";
import { MessageSquareText, Reply, Eye, Search, X, Star, ThumbsUp, ThumbsDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBestPerformingContent, useReplyRateTrend } from "@/hooks/use-analytics";
import { LeadPreviewModal } from "@/components/lead-preview-modal";
import type { BestPerformingEmail } from "@/lib/firestore-analytics";

const REPLY_COLOR = "#3b82f6";
const SENT_COLOR = "#6366f1";

function MiniReplyTrendChart({ series }: { series: { week: string; sent: number; replied: number; reply_rate: number }[] }) {
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
    const maxRate = d3.max(series, (s) => s.reply_rate) || 0.1;
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

    drawLine((d) => d.reply_rate, REPLY_COLOR, 0);

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

    const legend = g.append("g").attr("transform", `translate(${innerW - 70}, -4)`);
    const row = legend.append("g");
    row.append("line").attr("x1", 0).attr("x2", 10).attr("y1", 0).attr("y2", 0)
      .attr("stroke", REPLY_COLOR).attr("stroke-width", 1.5);
    row.append("text").attr("x", 13).attr("y", 3).text("Reply rate")
      .style("font-size", "8px").attr("fill", "currentColor").attr("opacity", 0.45);
  }, [series]);

  return <svg ref={svgRef} className="w-full" />;
}

function truncate(text: string, max = 60): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

const RATING_META: Record<string, { label: string; icon: typeof Star; className: string }> = {
  great:          { label: "Great",          icon: Star,       className: "border-amber-400/40 text-amber-400 bg-amber-400/5" },
  good:           { label: "Good",           icon: ThumbsUp,   className: "border-emerald-400/40 text-emerald-400 bg-emerald-400/5" },
  not_interested: { label: "Not interested", icon: ThumbsDown, className: "border-rose-400/40 text-rose-400 bg-rose-400/5" },
};

function RatingBadge({ rating, score }: { rating: string; score?: number | null }) {
  const meta = RATING_META[rating];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-medium ${meta.className}`}>
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
      {score != null && <span className="opacity-60">{score}/10</span>}
    </span>
  );
}

function ContentRow({
  email,
  onClick,
}: {
  email: BestPerformingEmail;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left grid grid-cols-[1fr_auto_auto] gap-3 py-1.5 items-center hover:bg-muted/30 rounded px-1 -mx-1 transition-colors group"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium truncate group-hover:text-foreground">
            {email.business_name}
          </p>
          {email.content_rating && <RatingBadge rating={email.content_rating} score={email.content_score} />}
        </div>
        {email.subject && (
          <p className="text-[10px] text-muted-foreground truncate">
            {truncate(email.subject, 50)}
          </p>
        )}
      </div>
      <div className={`text-xs font-medium w-16 text-right ${email.open_rate > 30 ? "text-emerald-400" : "text-muted-foreground"}`}>
        {email.open_rate.toFixed(1)}%
      </div>
      <div className={`text-xs font-medium w-16 text-right ${email.reply_rate > 10 ? "text-blue-400" : "text-muted-foreground"}`}>
        {email.reply_rate.toFixed(1)}%
      </div>
    </button>
  );
}

function ContentModal({
  emails,
  onClose,
}: {
  emails: BestPerformingEmail[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<BestPerformingEmail | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return emails;
    const q = search.toLowerCase();
    return emails.filter(
      (e) =>
        e.business_name.toLowerCase().includes(q) ||
        (e.subject ?? "").toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q)
    );
  }, [emails, search]);

  if (preview) {
    return (
      <LeadPreviewModal
        leadId={preview.lead_id}
        businessName={preview.business_name}
        contentRating={preview.content_rating}
        contentScore={preview.content_score}
        contentRatingReason={preview.content_rating_reason}
        onClose={() => setPreview(null)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-border/50 bg-card shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquareText className="h-4 w-4" /> Best Performing Content (
            {emails.length})
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by business, subject, or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="overflow-y-auto divide-y divide-border/40 flex-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              No results
            </p>
          ) : (
            filtered.map((e, i) => (
              <button
                key={`${e.lead_id}-${i}`}
                onClick={() => setPreview(e)}
                className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium">{e.business_name}</p>
                      {e.content_rating && <RatingBadge rating={e.content_rating} score={e.content_score} />}
                    </div>
                    {e.subject && (
                      <p className="text-xs text-muted-foreground truncate">
                        {e.subject}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2">
                      {e.content}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1 text-xs text-emerald-400">
                      <span>{e.open_rate.toFixed(1)}% open</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-blue-400">
                      <Reply className="h-3 w-3" />
                      <span>{e.reply_count} repl{e.reply_count === 1 ? "y" : "ies"} · {e.reply_rate.toFixed(1)}%</span>
                    </div>
                    {e.venue_category && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                        {e.venue_category}
                      </Badge>
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

type RatingFilter = "all" | "great" | "good" | "not_interested" | "unrated";

const FILTER_LABELS: Record<RatingFilter, string> = {
  all: "All", great: "Great", good: "Good", not_interested: "Not interested", unrated: "Unrated",
};

export function BestPerformingContentCard() {
  const { data, isLoading } = useBestPerformingContent();
  const { data: trendData } = useReplyRateTrend();
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState<BestPerformingEmail | null>(null);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");

  const allEmails: BestPerformingEmail[] = data ?? [];
  const emails = useMemo(() => {
    if (ratingFilter === "all") return allEmails;
    if (ratingFilter === "unrated") return allEmails.filter((e) => !e.content_rating);
    return allEmails.filter((e) => e.content_rating === ratingFilter);
  }, [allEmails, ratingFilter]);
  const totalReplies = emails.reduce((sum, e) => sum + e.reply_count, 0);
  const totalOpens = emails.reduce((sum, e) => sum + e.open_count, 0);
  const uniqueLeads = new Set(emails.map((e) => e.lead_id)).size;
  const replySeries = trendData?.series ?? [];
  const totalSent = replySeries.reduce((s, p) => s + p.sent, 0);
  const totalReplied = replySeries.reduce((s, p) => s + p.replied, 0);
  const overallReplyRate = totalSent > 0
    ? Math.round((totalReplied / totalSent) * 1000) / 10
    : 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquareText className="h-4 w-4" /> Best Performing Content
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-20 w-full" />
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
              <MessageSquareText className="h-4 w-4" /> Best Performing Content
            </CardTitle>
            {emails.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setModalOpen(true)}
              >
                See all {emails.length}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          {emails.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No replied emails yet.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-end gap-6 flex-wrap">
                <div>
                  <p className="text-3xl font-bold">{uniqueLeads}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">leads responded</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-blue-400">{totalReplies}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">total replies</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-emerald-400">{totalOpens}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">total opens</p>
                </div>
                {overallReplyRate > 0 && (
                  <div>
                    <p className="text-xl font-semibold text-violet-400">{overallReplyRate}%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">reply rate ({totalSent} sent)</p>
                  </div>
                )}
              </div>

              {replySeries.length > 0 && <MiniReplyTrendChart series={replySeries} />}

              {/* Rating filter */}
              <div className="flex items-center gap-1 flex-wrap">
                {(["all", "great", "good", "not_interested", "unrated"] as RatingFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setRatingFilter(f)}
                    className={`px-2 py-0.5 rounded-full border text-[10px] transition-colors ${
                      ratingFilter === f
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/40 text-muted-foreground hover:border-border"
                    }`}
                  >
                    {FILTER_LABELS[f]}
                    {f !== "all" && (
                      <span className="ml-1 opacity-50">
                        {f === "unrated"
                          ? allEmails.filter((e) => !e.content_rating).length
                          : allEmails.filter((e) => e.content_rating === f).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="divide-y divide-border/30">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                  <span>Business</span>
                  <span className="w-16 text-right">Open%</span>
                  <span className="w-16 text-right">Reply%</span>
                </div>
                {emails.slice(0, 5).map((e, i) => (
                  <ContentRow
                    key={`${e.lead_id}-${i}`}
                    email={e}
                    onClick={() => setPreview(e)}
                  />
                ))}
                {emails.length > 5 && (
                  <p className="text-[10px] text-muted-foreground/50 pt-1.5">
                    +{emails.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {modalOpen && (
        <ContentModal emails={emails} onClose={() => setModalOpen(false)} />
      )}
      {preview && !modalOpen && (
        <LeadPreviewModal
          leadId={preview.lead_id}
          businessName={preview.business_name}
          contentRating={preview.content_rating}
          contentScore={preview.content_score}
          contentRatingReason={preview.content_rating_reason}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
