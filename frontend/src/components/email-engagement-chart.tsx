"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOpenRateTrend } from "@/hooks/use-analytics";
import { Skeleton } from "@/components/ui/skeleton";

const OPEN_COLOR = "#3b82f6"; // blue
const REPLY_COLOR = "#059669"; // green

export function EmailEngagementChart() {
  const { data, isLoading } = useOpenRateTrend();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const series = data.series;
    if (series.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth ?? 500;
    const height = 240;
    const margin = { top: 20, right: 20, bottom: 30, left: 36 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scalePoint()
      .domain(series.map((s) => s.week))
      .range([0, innerW]);

    const maxRate = d3.max(series, (s) => Math.max(s.open_rate, s.reply_rate)) || 0.1;
    const y = d3.scaleLinear().domain([0, Math.max(maxRate * 1.2, 0.05)]).range([innerH, 0]);

    // Grid lines
    g.selectAll(".grid")
      .data(y.ticks(4))
      .join("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d))
      .attr("stroke", "currentColor")
      .attr("opacity", 0.05);

    // Helper to draw a line + area + dots for a metric
    function drawSeries(
      accessor: (d: (typeof series)[0]) => number,
      color: string,
      delay: number
    ) {
      const area = d3
        .area<(typeof series)[0]>()
        .x((d) => x(d.week)!)
        .y0(innerH)
        .y1((d) => y(accessor(d)))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(series)
        .attr("d", area)
        .attr("fill", color)
        .attr("opacity", 0.05);

      const line = d3
        .line<(typeof series)[0]>()
        .x((d) => x(d.week)!)
        .y((d) => y(accessor(d)))
        .curve(d3.curveMonotoneX);

      const path = g
        .append("path")
        .datum(series)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("opacity", 0.8);

      const totalLength = (path.node() as SVGPathElement)?.getTotalLength?.() ?? 0;
      if (totalLength > 0) {
        path
          .attr("stroke-dasharray", totalLength)
          .attr("stroke-dashoffset", totalLength)
          .transition()
          .delay(delay)
          .duration(1200)
          .attr("stroke-dashoffset", 0);
      }

      g.selectAll(`.dot-${color.replace("#", "")}`)
        .data(series)
        .join("circle")
        .attr("cx", (d) => x(d.week)!)
        .attr("cy", (d) => y(accessor(d)))
        .attr("r", 3)
        .attr("fill", color)
        .attr("opacity", 0.7);
    }

    drawSeries((d) => d.open_rate, OPEN_COLOR, 0);
    drawSeries((d) => d.reply_rate, REPLY_COLOR, 300);

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(x)
          .tickSize(0)
          .tickPadding(8)
          .tickFormat((d, i) => (i % 2 === 0 ? d : ""))
      )
      .selectAll("text")
      .style("font-size", "9px")
      .attr("opacity", 0.4);

    g.select(".domain").attr("opacity", 0.1);

    // Y axis
    g.append("g")
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickSize(0)
          .tickPadding(6)
          .tickFormat((d) => `${Math.round((d as number) * 100)}%`)
      )
      .selectAll("text")
      .style("font-size", "9px")
      .attr("opacity", 0.4);

    g.selectAll(".domain").attr("opacity", 0.1);

    // Legend
    const legend = g.append("g").attr("transform", `translate(${innerW - 130}, -8)`);

    [
      { label: "Open Rate", color: OPEN_COLOR },
      { label: "Reply Rate", color: REPLY_COLOR },
    ].forEach(({ label, color }, i) => {
      const row = legend.append("g").attr("transform", `translate(${i * 75}, 0)`);
      row.append("line").attr("x1", 0).attr("x2", 12).attr("y1", 0).attr("y2", 0)
        .attr("stroke", color).attr("stroke-width", 2);
      row.append("text").attr("x", 16).attr("y", 3).text(label)
        .style("font-size", "9px").attr("fill", "currentColor").attr("opacity", 0.5);
    });
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Email Engagement (12wk)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-60 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Email Engagement (12wk)</CardTitle>
      </CardHeader>
      <CardContent>
        <svg ref={svgRef} className="w-full" />
      </CardContent>
    </Card>
  );
}
