import { useQuery } from "@tanstack/react-query";
import { getLeadById } from "@/lib/firestore-api";

export function useLeadDetail(id: string) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: () => getLeadById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 min — lead enrichment doesn't change often
  });
}
