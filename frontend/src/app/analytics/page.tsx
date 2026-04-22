"use client";

import Link from "next/link";
import { Users, TrendingUp, Target, BarChart3, MessageSquare, Send, Eye, CheckCircle } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { FunnelChart } from "@/components/funnel-chart";
import { CategoryBreakdown } from "@/components/category-breakdown";
import { RatioChart } from "@/components/ratio-chart";
import { TrendsChart } from "@/components/trends-chart";
import { AIRecommendations } from "@/components/ai-recommendations";
import { SubjectLineChart } from "@/components/subject-line-chart";
import { ReplyRateTrendChart } from "@/components/reply-rate-trend-chart";
import { OutreachBreakdownChart } from "@/components/outreach-breakdown-chart";
import { EmailEngagementChart } from "@/components/email-engagement-chart";
import { EmailOpensCard } from "@/components/email-opens-card";
import { BestPerformingContentCard } from "@/components/best-performing-content-card";
import { Button } from "@/components/ui/button";
import { useFunnel, useCategories, useReplyRateTrend, useOpenRateTrend } from "@/hooks/use-analytics";
import { useAuth } from "@/lib/auth-context";

export default function AnalyticsPage() {
  const { isAdmin } = useAuth();
  const { data: funnelData } = useFunnel();
  const { data: categoryData } = useCategories();
  const { data: replyTrendData } = useReplyRateTrend();
  const { data: openTrendData } = useOpenRateTrend();

  const totalLeads = funnelData?.total_leads ?? 0;
  const stages = funnelData?.stages ?? [];

  const responded = stages.find((s) => s.name === "responded")?.count ?? 0;
  const converted = stages.find((s) => s.name === "converted")?.count ?? 0;
  const sent = stages.find((s) => s.name === "sent")?.count ?? 0;

  const responseRate = sent > 0 ? Math.round((responded / sent) * 100) : 0;
  const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

  const outreachSent = replyTrendData?.series.reduce((sum, s) => sum + s.sent, 0) ?? 0;
  const outreachReplied = replyTrendData?.series.reduce((sum, s) => sum + s.replied, 0) ?? 0;
  const overallReplyRate =
    outreachSent > 0 ? Math.round((outreachReplied / outreachSent) * 100) : 0;

  const engagementSent = openTrendData?.series.reduce((sum, s) => sum + s.sent, 0) ?? 0;
  const engagementOpened = openTrendData?.series.reduce((sum, s) => sum + s.opened, 0) ?? 0;
  const engagementDelivered = openTrendData?.series.reduce((sum, s) => sum + s.delivered, 0) ?? 0;
  const overallOpenRate =
    engagementSent > 0 ? Math.round((engagementOpened / engagementSent) * 100) : 0;
  const overallDeliveryRate =
    engagementSent > 0 ? Math.round((engagementDelivered / engagementSent) * 100) : 0;

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        {isAdmin && (
          <Link href="/analytics/team">
            <Button variant="outline" size="sm">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Team Metrics
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={Users} label="Total Leads" value={totalLeads} />
        <StatCard icon={TrendingUp} label="Response Rate" value={`${responseRate}%`} />
        <StatCard icon={Target} label="Conversion Rate" value={`${conversionRate}%`} />
        <StatCard icon={BarChart3} label="Avg Score" value={avgScore} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={MessageSquare} label="Reply Rate (12wk)" value={`${overallReplyRate}%`} />
        <StatCard icon={Eye} label="Open Rate (12wk)" value={`${overallOpenRate}%`} />
        <StatCard icon={CheckCircle} label="Delivery Rate (12wk)" value={`${overallDeliveryRate}%`} />
        <StatCard icon={Send} label="Total Sent (12wk)" value={engagementSent} />
      </div>

      <div data-tour="funnel-chart">
        <FunnelChart />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryBreakdown />
        <RatioChart />
      </div>

      <TrendsChart />

      <div className="space-y-2">
        <h2 className="px-0.5 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Outreach Performance
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <EmailEngagementChart />
          <ReplyRateTrendChart />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <OutreachBreakdownChart />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-stretch">
        <EmailOpensCard />
        <SubjectLineChart />
      </div>

      <BestPerformingContentCard />

      <AIRecommendations />
    </div>
  );
}
