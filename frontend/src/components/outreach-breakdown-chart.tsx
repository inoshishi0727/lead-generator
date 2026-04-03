"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReplyRateByDimension } from "@/hooks/use-analytics";
import { Skeleton } from "@/components/ui/skeleton";

export function OutreachBreakdownChart() {
  const { data, isLoading } = useReplyRateByDimension("tone_tier");
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const points = data.points.filter((p) => p.sent > 0);
    if (points.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth ?? 500;
    const barH = 28;
    const margin = { top: 16, right: 100, bottom: 16, left: 110 };
    const innerH = points.length * (barH + 8);
    const height = innerH + margin.top + margin.bottom;
    const innerW = width - margin.left - margin.right;

    svg.attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3
      .scaleBand()
      .domain(points.map((p) => p.label))
      .range([0, innerH])
      .padding(0.3);

    const maxRate = d3.max(points, (p) => p.reply_rate) || 0.1;
    const x = d3.scaleLinear().domain([0, Math.max(maxRate * 100 * 1.2, 5)]).range([0, innerW]);

    // Background bars (ghost)
    g.selectAll(".bg")
      .data(points)
      .join("rect")
      .attr("y", (d) => y(d.label)!)
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", innerW)
      .attr("rx", 3)
      .attr("fill", "currentColor")
      .attr("opacity", 0.04);

    // Actual bars
    g.selectAll(".bar")
      .data(points)
      .join("rect")
      .attr("class", "bar")
      .attr("y", (d) => y(d.label)!)
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", 0)
      .attr("rx", 3)
      .attr("fill", "#6366f1")
      .attr("opacity", 0.7)
      .transition()
      .duration(700)
      .delay((_d, i) => i * 60)
      .attr("width", (d) => x(d.reply_rate * 100));

    // Category labels
    g.selectAll(".label")
      .data(points)
      .join("text")
      .attr("y", (d) => y(d.label)! + y.bandwidth() / 2)
      .attr("x", -8)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("fill", "currentColor")
      .attr("opacity", 0.5)
      .style("font-size", "10px")
      .style("text-transform", "capitalize")
      .text((d) => d.label.replace(/_/g, " "));

    // Rate + sent count labels
    g.selectAll(".pct")
      .data(points)
      .join("text")
      .attr("y", (d) => y(d.label)! + y.bandwidth() / 2)
      .attr("x", (d) => x(d.reply_rate * 100) + 6)
      .attr("dy", "0.35em")
      .attr("fill", "currentColor")
      .attr("opacity", 0.45)
      .style("font-size", "10px")
      .style("font-family", "var(--font-mono, monospace)")
      .text((d) => `${Math.round(d.reply_rate * 100)}% (${d.sent} sent)`);
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Reply Rate by Tone Tier</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Reply Rate by Tone Tier</CardTitle>
      </CardHeader>
      <CardContent>
        <svg ref={svgRef} className="w-full" />
      </CardContent>
    </Card>
  );
}
