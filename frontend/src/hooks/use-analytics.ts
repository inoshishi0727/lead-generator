import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getFunnel, getCategories, getRatios, getTrends } from "@/lib/firestore-analytics";
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
    queryFn: () =>
      hasBackend
        ? api.get<FunnelData>("/api/analytics/funnel")
        : getFunnel(),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["analytics", "categories"],
    queryFn: () =>
      hasBackend
        ? api.get<{ categories: CategoryStat[] }>("/api/analytics/categories")
        : getCategories(),
  });
}

export function useRatios() {
  return useQuery({
    queryKey: ["analytics", "ratios"],
    queryFn: () =>
      hasBackend
        ? api.get<{ ratios: RatioComparison[] }>("/api/analytics/ratios")
        : getRatios(),
  });
}

export function useTrends(period: string = "week") {
  return useQuery({
    queryKey: ["analytics", "trends", period],
    queryFn: () =>
      hasBackend
        ? api.get<{ series: TrendPoint[] }>(`/api/analytics/trends?period=${period}`)
        : getTrends(period),
  });
}
