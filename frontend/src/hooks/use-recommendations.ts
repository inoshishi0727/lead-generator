import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StrategyResponse, LeadRecommendation } from "@/lib/types";

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;

export function useStrategy() {
  return useQuery({
    queryKey: ["recommendations", "strategy"],
    queryFn: async (): Promise<StrategyResponse> => {
      if (hasBackend) {
        return api.get<StrategyResponse>("/api/recommendations/strategy");
      }
      // Strategy requires server-side Gemini API — return empty when no backend
      return { insights: [], ratio_adjustments: [], query_suggestions: [], generated_at: new Date().toISOString() };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useLeadRecommendation(leadId: string | null) {
  return useQuery({
    queryKey: ["recommendations", "lead", leadId],
    queryFn: () =>
      api.get<LeadRecommendation>(`/api/recommendations/lead/${leadId}`),
    enabled: hasBackend && !!leadId,
    staleTime: 10 * 60 * 1000,
  });
}
