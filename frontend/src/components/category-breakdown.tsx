"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories } from "@/hooks/use-analytics";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#a855f7", "#d946ef",
];

export function CategoryBreakdown() {
  const { data, isLoading } = useCategories();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const categories = data.categories.filter((c) => c.count > 0);
    if (categories.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth ?? 500;
    const height = 320;

    svg.attr("width", width).attr("height", height);

    // Build treemap data
    const root = d3
      .hierarchy({ children: categories } as any)
      .sum((d: any) => d.count)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<any>()
      .size([width, height])
      .padding(3)
      .round(true)(root);

    const color = d3
      .scaleOrdinal<string>()
      .domain(categories.map((c) => c.category))
      .range(COLORS);

    const leaves = root.leaves();

    // Tiles
    const tiles = svg
      .selectAll(".tile")
      .data(leaves)
      .join("g")
      .attr("class", "tile")
      .attr("transform", (d: any) => `translate(${d.x0},${d.y0})`);

    tiles
      .append("rect")
      .attr("width", (d: any) => Math.max(d.x1 - d.x0, 0))
      .attr("height", (d: any) => Math.max(d.y1 - d.y0, 0))
      .attr("rx", 4)
      .attr("fill", (d: any) => color(d.data.category))
      .attr("opacity", 0)
      .transition()
      .duration(600)
      .delay((_d: any, i: number) => i * 50)
      .attr("opacity", 0.8);

    // Category name
    tiles
      .append("text")
      .attr("x", 8)
      .attr("y", 18)
      .attr("fill", "white")
      .attr("opacity", 0.9)
      .style("font-size", (d: any) => {
        const w = d.x1 - d.x0;
        return w > 100 ? "11px" : w > 60 ? "9px" : "0px";
      })
      .style("font-weight", "600")
      .style("text-transform", "capitalize")
      .text((d: any) => d.data.category?.replace(/_/g, " ") ?? "");

    // Count
    tiles
      .append("text")
      .attr("x", 8)
      .attr("y", 34)
      .attr("fill", "white")
      .attr("opacity", 0.6)
      .style("font-size", (d: any) => {
        const w = d.x1 - d.x0;
        return w > 80 ? "10px" : "0px";
      })
      .style("font-family", "var(--font-mono, monospace)")
      .text((d: any) => `${d.data.count} leads`);

    // Score + conversion on larger tiles
    tiles
      .append("text")
      .attr("x", 8)
      .attr("y", 48)
      .attr("fill", "white")
      .attr("opacity", 0.4)
      .style("font-size", (d: any) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        return w > 120 && h > 55 ? "9px" : "0px";
      })
      .text((d: any) =>
        `Score ${d.data.avg_score} · ${d.data.conversion_rate}% conv`
      );

  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Leads by Category</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-80 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Leads by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <svg ref={svgRef} className="w-full" />
      </CardContent>
    </Card>
  );
}
