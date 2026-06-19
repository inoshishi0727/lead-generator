/**
 * useDashboardStats — single TanStack Query wrapping ~10 parallel Firestore
 * count() calls. Replaces the dashboard's old "fetch every lead + 200 messages
 * and count client-side" pattern, dropping initial load from 15-20s to roughly
 * one round-trip's worth of latency.
 */
import { useQuery } from "@tanstack/react-query";

import { getDashboardCounts, type DashboardCounts } from "@/lib/firestore-api";

export type { DashboardCounts };

export function useDashboardStats(assignedTo?: string) {
  return useQuery<DashboardCounts>({
    queryKey: ["dashboard", "stats", assignedTo ?? null],
    queryFn: () => getDashboardCounts(assignedTo),
    staleTime: 30_000,
  });
}
