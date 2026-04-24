import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getFunnel, getCategories, getRatios, getTrends, getSubjectLineStats, getReplyRateTrend, getReplyRateByDimension, getOpenRateTrend, getTopOpeners, getBestPerformingContent, getEmailsBySubject, getEmailPerformance7Day } from "@/lib/firestore-analytics";
import { getTeamMetrics } from "@/lib/firestore-team-analytics";
import type {
  FunnelData,
  CategoryStat,
  RatioComparison,
  TrendPoint,
  SubjectLineStat,
  ReplyRateTrendPoint,
  ReplyRateByDimensionPoint,
  OpenRateTrendPoint,
  MemberMetrics,
  EmailPerformance7Day as EmailPerformance7DayType,
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

export function useSubjectLineStats() {
  return useQuery({
    queryKey: ["analytics", "subject-lines"],
    queryFn: () => getSubjectLineStats(),
  });
}

export function useReplyRateTrend() {
  return useQuery<{ series: ReplyRateTrendPoint[] }>({
    queryKey: ["analytics", "reply-rate-trend"],
    queryFn: () => getReplyRateTrend(),
  });
}

export function useOpenRateTrend() {
  return useQuery<{ series: OpenRateTrendPoint[] }>({
    queryKey: ["analytics", "open-rate-trend"],
    queryFn: () => getOpenRateTrend(),
  });
}

export function useReplyRateByDimension(dimension: "tone_tier" | "step_number" | "variant") {
  return useQuery<{ points: ReplyRateByDimensionPoint[] }>({
    queryKey: ["analytics", "reply-rate-by-dimension", dimension],
    queryFn: () => getReplyRateByDimension(dimension),
  });
}

export function useTeamMetrics() {
  return useQuery<MemberMetrics[]>({
    queryKey: ["analytics", "team-metrics"],
    queryFn: () => getTeamMetrics(),
  });
}

export function useTopOpeners() {
  return useQuery<import("@/lib/firestore-analytics").TopOpenersResult>({
    queryKey: ["analytics", "top-openers"],
    queryFn: () => getTopOpeners(),
  });
}

export function useBestPerformingContent() {
  return useQuery({
    queryKey: ["analytics", "best-performing-content"],
    queryFn: () => getBestPerformingContent(),
  });
}

export function useEmailsBySubject(subject: string | null) {
  return useQuery({
    queryKey: ["analytics", "emails-by-subject", subject],
    queryFn: () => getEmailsBySubject(subject!),
    enabled: !!subject,
  });
}

export function useEmailPerformance7Day() {
  return useQuery<EmailPerformance7DayType>({
    queryKey: ["analytics", "email-performance-7day"],
    queryFn: () => getEmailPerformance7Day(),
  });
}
