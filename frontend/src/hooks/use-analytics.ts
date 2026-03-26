import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  FunnelData,
  CategoryStat,
  RatioComparison,
  TrendPoint,
} from "@/lib/types";

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;

export function useFunnel() {
  return useQuery({
    queryKey: ["analytics", "funnel"],
    queryFn: () => api.get<FunnelData>("/api/analytics/funnel"),
    enabled: hasBackend,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["analytics", "categories"],
    queryFn: () =>
      api.get<{ categories: CategoryStat[] }>("/api/analytics/categories"),
    enabled: hasBackend,
  });
}

export function useRatios() {
  return useQuery({
    queryKey: ["analytics", "ratios"],
    queryFn: () =>
      api.get<{ ratios: RatioComparison[] }>("/api/analytics/ratios"),
    enabled: hasBackend,
  });
}

export function useTrends(period: string = "week") {
  return useQuery({
    queryKey: ["analytics", "trends", period],
    queryFn: () =>
      api.get<{ series: TrendPoint[] }>(
        `/api/analytics/trends?period=${period}`
      ),
    enabled: hasBackend,
  });
}
