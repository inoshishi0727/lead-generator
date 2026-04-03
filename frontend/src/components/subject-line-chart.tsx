"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubjectLineStats } from "@/hooks/use-analytics";
import { Skeleton } from "@/components/ui/skeleton";

function truncate(text: string, max = 40): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export function SubjectLineChart() {
  const { data, isLoading } = useSubjectLineStats();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const stats = (Array.isArray(data) ? data : (data as any).stats ?? []).filter(
      (s: any) => s.sent > 0
    );
    if (stats.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth ?? 700;
    const barH = 26;
    const margin = { top: 16, right: 110, bottom: 16, left: 180 };
    const innerH = stats.length * (barH + 10);
    const height = innerH + margin.top + margin.bottom;
    const innerW = width - margin.left - margin.right;

    svg.attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3
      .scaleBand()
      .domain(stats.map((s: any) => s.subject))
      .range([0, innerH])
      .padding(0.3);

    const maxRate = d3.max(stats, (s: any) => s.reply_rate as number) || 0.1;
    const x = d3.scaleLinear().domain([0, Math.max((maxRate as number) * 100 * 1.2, 5)]).range([0, innerW]);

    // Background bars
    g.selectAll(".bg")
      .data(stats)
      .join("rect")
      .attr("y", (d: any) => y(d.subject)!)
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", innerW)
      .attr("rx", 3)
      .attr("fill", "currentColor")
      .attr("opacity", 0.04);

    // Actual bars
    g.selectAll(".bar")
      .data(stats)
      .join("rect")
      .attr("class", "bar")
      .attr("y", (d: any) => y(d.subject)!)
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", 0)
      .attr("rx", 3)
      .attr("fill", "#0891b2")
      .attr("opacity", 0.7)
      .transition()
      .duration(700)
      .delay((_d: any, i: number) => i * 60)
      .attr("width", (d: any) => x(d.reply_rate * 100));

    // Subject labels
    g.selectAll(".label")
      .data(stats)
      .join("text")
      .attr("y", (d: any) => y(d.subject)! + y.bandwidth() / 2)
      .attr("x", -8)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("fill", "currentColor")
      .attr("opacity", 0.5)
      .style("font-size", "10px")
      .text((d: any) => truncate(d.subject));

    // Rate + sent count labels
    g.selectAll(".pct")
      .data(stats)
      .join("text")
      .attr("y", (d: any) => y(d.subject)! + y.bandwidth() / 2)
      .attr("x", (d: any) => x(d.reply_rate * 100) + 6)
      .attr("dy", "0.35em")
      .attr("fill", "currentColor")
      .attr("opacity", 0.45)
      .style("font-size", "10px")
      .style("font-family", "var(--font-mono, monospace)")
      .text((d: any) => `${Math.round(d.reply_rate * 100)}% · ${d.sent} sent`);
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Subject Line Performance</CardTitle>
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
        <CardTitle className="text-sm font-medium">Subject Line Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <svg ref={svgRef} className="w-full" />
      </CardContent>
    </Card>
  );
}
