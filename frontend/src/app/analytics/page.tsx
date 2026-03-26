"use client";

import { Users, TrendingUp, Target, BarChart3 } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { FunnelChart } from "@/components/funnel-chart";
import { CategoryBreakdown } from "@/components/category-breakdown";
import { RatioChart } from "@/components/ratio-chart";
import { TrendsChart } from "@/components/trends-chart";
import { AIRecommendations } from "@/components/ai-recommendations";
import { useFunnel, useCategories } from "@/hooks/use-analytics";

export default function AnalyticsPage() {
  const { data: funnelData } = useFunnel();
  const { data: categoryData } = useCategories();

  const totalLeads = funnelData?.total_leads ?? 0;
  const stages = funnelData?.stages ?? [];

  const responded = stages.find((s) => s.name === "responded")?.count ?? 0;
  const converted = stages.find((s) => s.name === "converted")?.count ?? 0;
  const sent = stages.find((s) => s.name === "sent")?.count ?? 0;

  const responseRate = sent > 0 ? Math.round((responded / sent) * 100) : 0;
  const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

  const categories = categoryData?.categories ?? [];
  const avgScore =
    categories.length > 0
      ? Math.round(
          categories.reduce((sum, c) => sum + c.avg_score * c.count, 0) /
            Math.max(categories.reduce((sum, c) => sum + c.count, 0), 1)
        )
      : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={Users} label="Total Leads" value={totalLeads} />
        <StatCard icon={TrendingUp} label="Response Rate" value={`${responseRate}%`} />
        <StatCard icon={Target} label="Conversion Rate" value={`${conversionRate}%`} />
        <StatCard icon={BarChart3} label="Avg Score" value={avgScore} />
      </div>

      <FunnelChart />

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryBreakdown />
        <RatioChart />
      </div>

      <TrendsChart />

      <AIRecommendations />
    </div>
  );
}
