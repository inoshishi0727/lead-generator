"use client";

import { ScrapeControl } from "@/components/scrape-control";
import { ScrapeStatus } from "@/components/scrape-status";
import { StatCard } from "@/components/stat-card";
import { OutreachPlan } from "@/components/outreach-plan";
import { useScrape } from "@/hooks/use-scrape";
import { useLeads } from "@/hooks/use-leads";
import { Users, Activity, Mail } from "lucide-react";

export default function DashboardPage() {
  const { startScrape, isStarting, status } = useScrape();
  const { data: leads } = useLeads();

  const isRunning =
    status?.status === "pending" || status?.status === "running";

  const totalLeads = leads?.length ?? 0;
  const emailsFound = leads?.filter((l) => l.email).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          AI-powered lead generation pipeline
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Total Leads" value={totalLeads} />
        <StatCard
          icon={Activity}
          label="Active Scrapes"
          value={isRunning ? 1 : 0}
        />
        <StatCard icon={Mail} label="Emails Found" value={emailsFound} />
      </div>

      <OutreachPlan />

      <div className="grid gap-6 lg:grid-cols-2">
        <ScrapeControl
          onStart={(queries, limit, headless) =>
            startScrape({ queries, limit, headless })
          }
          isStarting={isStarting}
          isRunning={isRunning}
        />
        {status && <ScrapeStatus status={status} />}
      </div>
    </div>
  );
}
