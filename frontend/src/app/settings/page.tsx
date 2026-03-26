"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EnvStatus } from "@/components/env-status";
import { SearchQueriesList } from "@/components/search-queries-list";
import { RatioManager } from "@/components/ratio-manager";
import { SuggestedQueries } from "@/components/suggested-queries";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfig } from "@/hooks/use-config";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, loading, router]);
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
