import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LeadDetail } from "@/lib/types";

export function useLeadDetail(id: string) {
  return useQuery({
    queryKey: ["lead", id],
    queryFn: () => api.get<LeadDetail>(`/api/leads/${id}`),
    enabled: !!id,
  });
}
