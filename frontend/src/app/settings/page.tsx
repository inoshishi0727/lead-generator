"use client";

import { EnvStatus } from "@/components/env-status";
import { SearchQueriesList } from "@/components/search-queries-list";
import { RatioManager } from "@/components/ratio-manager";
import { SuggestedQueries } from "@/components/suggested-queries";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfig } from "@/hooks/use-config";

export default function SettingsPage() {
  const { data: config, isLoading } = useConfig();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <EnvStatus envVars={config.env_vars} />
      <SearchQueriesList queries={config.search_queries} />
      <RatioManager />
      <SuggestedQueries />
    </div>
  );
}
