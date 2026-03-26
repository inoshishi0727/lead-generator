"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFunnel } from "@/hooks/use-analytics";
import { Skeleton } from "@/components/ui/skeleton";

const DISPLAY_STAGES = [
  "scraped", "enriched", "scored", "draft_generated",
  "approved", "sent", "responded", "converted",
];

const COLORS = [
  "#6366f1", "#818cf8", "#a78bfa", "#7c3aed",
  "#2563eb", "#0891b2", "#059669", "#d97706",
];

export function FunnelChart() {
  const { data, isLoading } = useFunnel();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const stages = data.stages.filter((s) => DISPLAY_STAGES.includes(s.name));
    if (stages.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth ?? 600;
    const height = 320;
    const margin = { top: 20, right: 30, bottom: 20, left: 120 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr("width", width).attr("height", height);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const maxCount = d3.max(stages, (d) => d.count) || 1;

    const y = d3
      .scaleBand()
      .domain(stages.map((s) => s.name))
      .range([0, innerH])
      .padding(0.25);

    const x = d3.scaleLinear().domain([0, maxCount]).range([0, innerW]);

    // Bars — rounded, with gradient feel
    g.selectAll(".bar")
      .data(stages)
      .join("rect")
      .attr("class", "bar")
      .attr("y", (d) => y(d.name)!)
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", 0)
      .attr("rx", 4)
      .attr("fill", (_d, i) => COLORS[i % COLORS.length])
      .attr("opacity", 0.85)
      .transition()
      .duration(800)
      .delay((_d, i) => i * 80)
      .attr("width", (d) => Math.max(x(d.count), 2));

    // Count labels on bars
    g.selectAll(".count")
      .data(stages)
      .join("text")
      .attr("class", "count")
      .attr("y", (d) => y(d.name)! + y.bandwidth() / 2)
      .attr("x", (d) => Math.max(x(d.count), 2) + 8)
      .attr("dy", "0.35em")
      .attr("fill", "currentColor")
      .attr("opacity", 0.7)
      .style("font-size", "12px")
      .style("font-family", "var(--font-mono, monospace)")
      .text((d) => `${d.count} (${d.conversion_rate}%)`);

    // Stage labels on left
    g.selectAll(".label")
      .data(stages)
      .join("text")
      .attr("class", "label")
      .attr("y", (d) => y(d.name)! + y.bandwidth() / 2)
      .attr("x", -8)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("fill", "currentColor")
      .attr("opacity", 0.6)
      .style("font-size", "11px")
      .style("text-transform", "capitalize")
      .text((d) => d.name.replace(/_/g, " "));

  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Pipeline Funnel</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-80 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Pipeline Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <svg ref={svgRef} className="w-full" />
      </CardContent>
    </Card>
  );
}
