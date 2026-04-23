"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Send, Reply, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailPerformance7Day } from "@/hooks/use-analytics";

const SENT_COLOR = "#3b82f6";
const REPLIED_COLOR = "#059669";

function PerformanceChart({ series }: { series: { date: string; sent: number; replied: number }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!series.length || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth ?? 600;
    const height = 180;
    const margin = { top: 12, right: 12, bottom: 28, left: 36 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scalePoint<string>()
      .domain(series.map((s) => s.date))
      .range([0, innerW]);

    const maxY = d3.max(series, (d) => Math.max(d.sent, d.replied)) || 1;
    const y = d3.scaleLinear()
      .domain([0, maxY * 1.3])
      .range([innerH, 0]);

    function drawArea(accessor: (d: typeof series[0]) => number, color: string, delay: number) {
      const area = d3.area<typeof series[0]>()
        .x((d) => x(d.date)!)
        .y0(innerH)
        .y1((d) => y(accessor(d)))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(series)
        .attr("d", area)
        .attr("fill", color)
        .attr("opacity", 0.08);

      const line = d3.line<typeof series[0]>()
        .x((d) => x(d.date)!)
        .y((d) => y(accessor(d)))
        .curve(d3.curveMonotoneX);

      const path = g.append("path")
        .datum(series)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("opacity", 0.85);

      const len = (path.node() as SVGPathElement)?.getTotalLength?.() ?? 0;
      if (len > 0) {
        path
          .attr("stroke-dasharray", len)
          .attr("stroke-dashoffset", len)
          .transition()
          .delay(delay)
          .duration(800)
          .attr("stroke-dashoffset", 0);
      }

      g.selectAll(null)
        .data(series)
        .join("circle")
        .attr("cx", (d) => x(d.date)!)
        .attr("cy", (d) => y(accessor(d)))
        .attr("r", 2.5)
        .attr("fill", color)
        .attr("opacity", 0);

      g.selectAll(null)
        .data(series)
        .join("circle")
        .attr("cx", (d) => x(d.date)!)
        .attr("cy", (d) => y(accessor(d)))
        .attr("r", 2.5)
        .attr("fill", color)
        .attr("opacity", 0)
        .transition()
        .delay(delay + 400)
        .duration(300)
        .attr("opacity", 0.8);
    }

    drawArea((d) => d.sent, SENT_COLOR, 0);
    drawArea((d) => d.replied, REPLIED_COLOR, 200);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(6)
        .tickFormat((d) => {
          const date = new Date(String(d) + "T00:00:00");
          return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
        }))
      .selectAll("text")
      .style("font-size", "9px")
      .attr("opacity", 0.5);
    g.select(".domain").attr("opacity", 0.08);

    g.append("g")
      .call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(4)
        .tickFormat((d) => String(d)))
      .selectAll("text")
      .style("font-size", "9px")
      .attr("opacity", 0.4);
    g.selectAll(".domain").attr("opacity", 0.08);

    const legend = g.append("g").attr("transform", `translate(${innerW - 160}, -6)`);
    [{ label: "Sent", color: SENT_COLOR }, { label: "Replied", color: REPLIED_COLOR }].forEach(({ label, color }, i) => {
      const row = legend.append("g").attr("transform", `translate(${i * 82}, 0)`);
      row.append("line").attr("x1", 0).attr("x2", 14).attr("y1", 0).attr("y2", 0)
        .attr("stroke", color).attr("stroke-width", 2);
      row.append("circle").attr("cx", 7).attr("cy", 0).attr("r", 2.5).attr("fill", color);
      row.append("text").attr("x", 18).attr("y", 3).text(label)
        .style("font-size", "9px").attr("fill", "currentColor").attr("opacity", 0.5);
    });
  }, [series]);

  return <svg ref={svgRef} className="w-full" />;
}

export function EmailPerformanceCard() {
  const { data, isLoading } = useEmailPerformance7Day();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Email Performance (7 days)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-6">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
          <Skeleton className="h-44 w-full" />
        </CardContent>
      </Card>
    );
  }

  const totalSent = data?.totalSent ?? 0;
  const totalReplied = data?.totalReplied ?? 0;
  const replyRate = data?.replyRate ?? 0;
  const series = data?.series ?? [];

  if (totalSent === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Email Performance (7 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No outreach data in the last 7 days.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Email Performance (7 days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-8 mb-4">
          <div>
            <p className="text-3xl font-bold tabular-nums">{totalSent}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Send className="h-3 w-3" /> contacts sent
            </p>
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums text-emerald-500">{totalReplied}</p>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Reply className="h-3 w-3" /> replied
            </p>
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums">{replyRate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">reply rate</p>
          </div>
        </div>
        {series.length > 0 && <PerformanceChart series={series} />}
      </CardContent>
    </Card>
  );
}