"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRatios } from "@/hooks/use-analytics";
import { Skeleton } from "@/components/ui/skeleton";

export function RatioChart() {
  const { data, isLoading } = useRatios();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const ratios = data.ratios.filter((r) => r.target > 0 || r.actual > 0);
    if (ratios.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth ?? 500;
    const height = 320;
    const margin = { top: 20, right: 40, bottom: 20, left: 120 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3
      .scaleBand()
      .domain(ratios.map((r) => r.category))
      .range([0, innerH])
      .padding(0.35);

    const maxVal = d3.max(ratios, (r) => Math.max(r.target, r.actual)) || 0.3;
    const x = d3.scaleLinear().domain([0, maxVal * 100]).range([0, innerW]);

    // Target bars (ghost)
    g.selectAll(".target")
      .data(ratios)
      .join("rect")
      .attr("class", "target")
      .attr("y", (d) => y(d.category)!)
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", (d) => x(d.target * 100))
      .attr("rx", 3)
      .attr("fill", "currentColor")
      .attr("opacity", 0.08);

    // Actual bars
    g.selectAll(".actual")
      .data(ratios)
      .join("rect")
      .attr("class", "actual")
      .attr("y", (d) => y(d.category)!)
      .attr("height", y.bandwidth())
      .attr("x", 0)
      .attr("width", 0)
      .attr("rx", 3)
      .attr("fill", (d) => {
        const delta = d.actual - d.target;
        if (Math.abs(delta) < 0.03) return "#22c55e"; // on target
        return delta > 0 ? "#f97316" : "#ef4444"; // over / under
      })
      .attr("opacity", 0.75)
      .transition()
      .duration(700)
      .delay((_d, i) => i * 60)
      .attr("width", (d) => x(d.actual * 100));

    // Labels
    g.selectAll(".label")
      .data(ratios)
      .join("text")
      .attr("y", (d) => y(d.category)! + y.bandwidth() / 2)
      .attr("x", -8)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("fill", "currentColor")
      .attr("opacity", 0.5)
      .style("font-size", "10px")
      .style("text-transform", "capitalize")
      .text((d) => d.category.replace(/_/g, " "));

    // Percentage labels
    g.selectAll(".pct")
      .data(ratios)
      .join("text")
      .attr("y", (d) => y(d.category)! + y.bandwidth() / 2)
      .attr("x", (d) => x(d.actual * 100) + 6)
      .attr("dy", "0.35em")
      .attr("fill", "currentColor")
      .attr("opacity", 0.5)
      .style("font-size", "10px")
      .style("font-family", "var(--font-mono, monospace)")
      .text((d) => `${Math.round(d.actual * 100)}% / ${Math.round(d.target * 100)}%`);

  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Target vs Actual</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-80 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Target vs Actual Ratios</CardTitle>
      </CardHeader>
      <CardContent>
        <svg ref={svgRef} className="w-full" />
      </CardContent>
    </Card>
  );
}
