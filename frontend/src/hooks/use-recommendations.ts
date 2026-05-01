import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StrategyResponse, LeadRecommendation } from "@/lib/types";

export function useStrategy() {
  return useQuery({
    queryKey: ["recommendations", "strategy"],
    queryFn: (): Promise<StrategyResponse> =>
      api.get<StrategyResponse>("/api/recommendations/strategy"),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export function useLeadRecommendation(leadId: string | null) {
  return useQuery({
    queryKey: ["recommendations", "lead", leadId],
    queryFn: () =>
      api.get<LeadRecommendation>(`/api/recommendations/lead/${leadId}`),
    enabled: !!leadId,
    staleTime: 10 * 60 * 1000,
  });
}
