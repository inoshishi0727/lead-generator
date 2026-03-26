import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface RatioData {
  target: Record<string, number>;
  actual: Record<string, number>;
  deficits: { category: string; target: number; actual: number; delta: number }[];
}

interface Suggestion {
  category: string;
  query: string;
  priority: "high" | "medium" | "low";
}

export function useRatioConfig() {
  return useQuery({
    queryKey: ["ratios"],
    queryFn: () => api.get<RatioData>("/api/ratios"),
  });
}

export function useUpdateRatios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ratios: Record<string, number>) =>
      api.put<{ status: string }>("/api/ratios", { ratios }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ratios"] });
    },
  });
}

export function useRatioSuggestions() {
  return useQuery({
    queryKey: ["ratios", "suggestions"],
    queryFn: () =>
      api.get<{ suggestions: Suggestion[] }>("/api/ratios/suggestions"),
  });
}
