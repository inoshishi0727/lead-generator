"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories } from "@/hooks/use-analytics";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6",
];
const OTHER_COLOR = "#52525b";
const TOP_N = 10;

interface Slice {
  category: string;
  label: string;
  count: number;
  avg_score: number | null;
  conversion_rate: number | null;
  color: string;
  isOther: boolean;
  /** for "Other" only — categories absorbed into the bucket */
  othersCount?: number;
}

function formatLabel(slug: string): string {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CategoryBreakdown() {
  const { data, isLoading } = useCategories();
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const slices: Slice[] = useMemo(() => {
    if (!data) return [];
    const visible = data.categories.filter((c) => c.count > 0);
    if (visible.length === 0) return [];

    const sorted = [...visible].sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, TOP_N);
    const tail = sorted.slice(TOP_N);

    const out: Slice[] = top.map((c, i) => ({
      category: c.category,
      label: formatLabel(c.category),
      count: c.count,
      avg_score: c.avg_score ?? null,
      conversion_rate: c.conversion_rate ?? null,
      color: COLORS[i % COLORS.length],
      isOther: false,
    }));

    if (tail.length > 0) {
      const tailCount = tail.reduce((s, c) => s + c.count, 0);
      out.push({
        category: "__other__",
        label: `Other (${tail.length} more)`,
        count: tailCount,
        avg_score: null,
        conversion_rate: null,
        color: OTHER_COLOR,
        isOther: true,
        othersCount: tail.length,
      });
    }

    return out;
  }, [data]);

  const total = useMemo(() => slices.reduce((s, c) => s + c.count, 0), [slices]);

  useEffect(() => {
    if (slices.length === 0 || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const size = 280;
    const radius = size / 2;
    const inner = radius * 0.6;

    svg.attr("viewBox", `0 0 ${size} ${size}`).attr("width", "100%").attr("height", size);

    const g = svg.append("g").attr("transform", `translate(${radius},${radius})`);

    const pie = d3.pie<Slice>().value((d) => d.count).sort(null);
    const arc = d3.arc<d3.PieArcDatum<Slice>>().innerRadius(inner).outerRadius(radius - 2);
    const arcHover = d3.arc<d3.PieArcDatum<Slice>>().innerRadius(inner).outerRadius(radius + 4);

    const arcs = pie(slices);

    g.selectAll("path")
      .data(arcs)
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => d.data.color)
      .attr("opacity", 0.85)
      .attr("stroke", "var(--background, #0a0a0a)")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("mouseenter", function (_e, d) {
        setActiveKey(d.data.category);
        d3.select(this).transition().duration(150).attr("d", arcHover as unknown as string).attr("opacity", 1);
      })
      .on("mouseleave", function () {
        setActiveKey(null);
        d3.select(this).transition().duration(150).attr("d", arc as unknown as string).attr("opacity", 0.85);
      });

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .attr("fill", "currentColor")
      .style("font-size", "26px")
      .style("font-weight", "600")
      .text(total);

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.4em")
      .attr("fill", "currentColor")
      .attr("opacity", 0.6)
      .style("font-size", "11px")
      .text("leads");
  }, [slices, total]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Leads by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (slices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Leads by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No category data yet.</p>
        </CardContent>
      </Card>
    );
  }

  const active = activeKey ? slices.find((s) => s.category === activeKey) ?? null : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Leads by Category</CardTitle>
        <span className="text-xs text-muted-foreground">Total: {total}</span>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 items-start">
          <div className="relative">
            <svg ref={svgRef} />
            {active && (
              <div className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                <div className="font-medium text-foreground">{active.label}</div>
                <div className="text-muted-foreground">
                  {active.count} leads ({((active.count / total) * 100).toFixed(1)}%)
                  {active.avg_score != null && ` · Score ${active.avg_score}`}
                  {active.conversion_rate != null && ` · ${active.conversion_rate}% conv`}
                  {active.isOther && active.othersCount != null && ` · ${active.othersCount} categories`}
                </div>
              </div>
            )}
          </div>

          <ul className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
            {slices.map((s) => {
              const pct = total > 0 ? (s.count / total) * 100 : 0;
              const isActive = activeKey === s.category;
              return (
                <li
                  key={s.category}
                  onMouseEnter={() => setActiveKey(s.category)}
                  onMouseLeave={() => setActiveKey(null)}
                  className={`flex items-center gap-2 rounded px-2 py-1 transition-colors cursor-default ${
                    isActive ? "bg-muted/60" : "hover:bg-muted/30"
                  }`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className={`flex-1 truncate text-sm ${s.isOther ? "text-muted-foreground italic" : ""}`}>
                    {s.label}
                  </span>
                  <span className="tabular-nums text-sm font-medium text-foreground">{s.count}</span>
                  <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
