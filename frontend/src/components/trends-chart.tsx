"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrends } from "@/hooks/use-analytics";
import { Skeleton } from "@/components/ui/skeleton";

const SERIES = [
  { key: "scraped", color: "#6366f1", label: "Scraped" },
  { key: "enriched", color: "#8b5cf6", label: "Enriched" },
  { key: "scored", color: "#0891b2", label: "Scored" },
  { key: "sent", color: "#059669", label: "Sent" },
  { key: "converted", color: "#d97706", label: "Converted" },
] as const;

export function TrendsChart() {
  const { data, isLoading } = useTrends("week");
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const series = data.series;
    if (series.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth ?? 700;
    const height = 280;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scalePoint()
      .domain(series.map((s) => s.period))
      .range([0, innerW]);

    const maxVal = d3.max(series, (s) =>
      Math.max(s.scraped, s.enriched, s.scored, s.sent, s.converted)
    ) || 10;

    const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([innerH, 0]);

    // Grid lines
    g.selectAll(".grid")
      .data(y.ticks(5))
      .join("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "currentColor")
      .attr("opacity", 0.05);

    // Draw each series
    for (const s of SERIES) {
      const area = d3
        .area<any>()
        .x((d) => x(d.period)!)
        .y0(innerH)
        .y1((d) => y(d[s.key]))
        .curve(d3.curveMonotoneX);

      const line = d3
        .line<any>()
        .x((d) => x(d.period)!)
        .y((d) => y(d[s.key]))
        .curve(d3.curveMonotoneX);

      // Area fill
      g.append("path")
        .datum(series)
        .attr("d", area)
        .attr("fill", s.color)
        .attr("opacity", 0.06);

      // Line
      const path = g
        .append("path")
        .datum(series)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", s.color)
        .attr("stroke-width", 2)
        .attr("opacity", 0.8);

      // Animate line drawing
      const totalLength = (path.node() as SVGPathElement)?.getTotalLength?.() ?? 0;
      if (totalLength > 0) {
        path
          .attr("stroke-dasharray", totalLength)
          .attr("stroke-dashoffset", totalLength)
          .transition()
          .duration(1200)
          .attr("stroke-dashoffset", 0);
      }

      // Dots
      g.selectAll(`.dot-${s.key}`)
        .data(series)
        .join("circle")
        .attr("cx", (d) => x(d.period)!)
        .attr("cy", (d: any) => y(d[s.key]))
        .attr("r", 3)
        .attr("fill", s.color)
        .attr("opacity", 0.6);
    }

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3.axisBottom(x).tickSize(0).tickPadding(8)
      )
      .selectAll("text")
      .style("font-size", "9px")
      .attr("opacity", 0.4);

    g.select(".domain").attr("opacity", 0.1);

    // Legend
    const legend = svg
      .append("g")
      .attr("transform", `translate(${margin.left + 10}, 8)`);

    SERIES.forEach((s, i) => {
      const lg = legend.append("g").attr("transform", `translate(${i * 90}, 0)`);
      lg.append("circle").attr("r", 4).attr("fill", s.color).attr("opacity", 0.8);
      lg.append("text")
        .attr("x", 8)
        .attr("dy", "0.35em")
        .attr("fill", "currentColor")
        .attr("opacity", 0.5)
        .style("font-size", "9px")
        .text(s.label);
    });

  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Weekly Trends</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-72 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Weekly Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <svg ref={svgRef} className="w-full" />
      </CardContent>
    </Card>
  );
}
