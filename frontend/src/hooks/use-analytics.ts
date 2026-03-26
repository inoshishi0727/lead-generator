import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  FunnelData,
  CategoryStat,
  RatioComparison,
  TrendPoint,
} from "@/lib/types";

export function useFunnel() {
  return useQuery({
    queryKey: ["analytics", "funnel"],
    queryFn: () => api.get<FunnelData>("/api/analytics/funnel"),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["analytics", "categories"],
    queryFn: () =>
      api.get<{ categories: CategoryStat[] }>("/api/analytics/categories"),
  });
}

export function useRatios() {
  return useQuery({
    queryKey: ["analytics", "ratios"],
    queryFn: () =>
      api.get<{ ratios: RatioComparison[] }>("/api/analytics/ratios"),
  });
}

export function useTrends(period: string = "week") {
  return useQuery({
    queryKey: ["analytics", "trends", period],
    queryFn: () =>
      api.get<{ series: TrendPoint[] }>(
        `/api/analytics/trends?period=${period}`
      ),
  });
}
