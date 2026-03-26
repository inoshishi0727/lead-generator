import { useQuery } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { api } from "@/lib/api";
import type { StrategyResponse, LeadRecommendation } from "@/lib/types";

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;

export function useStrategy() {
  return useQuery({
    queryKey: ["recommendations", "strategy"],
    queryFn: async () => {
      if (hasBackend) {
        return api.get<StrategyResponse>("/api/recommendations/strategy");
      }
      const fn = httpsCallable<Record<string, never>, StrategyResponse>(functions, "getStrategy");
      const result = await fn({});
      return result.data;
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
