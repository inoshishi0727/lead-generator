import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getLeads, createLead } from "@/lib/firestore-api";
import { vpsApi } from "@/lib/vps-api";
import type { Lead } from "@/lib/types";

export interface LeadFilters {
  source?: string;
  stage?: string;
  search?: string;
}

export function useLeads(filters?: LeadFilters) {
  const params = new URLSearchParams();
  if (filters?.source) params.set("source", filters.source);
  if (filters?.stage) params.set("stage", filters.stage);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();
  const path = qs ? `/api/leads?${qs}` : "/api/leads";

  return useQuery({
    queryKey: ["leads", filters],
    queryFn: () =>
      getLeads(filters),
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      business_name: string;
      website?: string | null;
      instagram_handle?: string | null;
    }) => createLead(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useEnrichLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { force?: boolean; lead_ids?: string[] }) => {
      return vpsApi.post<{ status: string; enriched: number; failed: number }>(
        "/api/enrich",
        { force: opts?.force ?? false, lead_ids: opts?.lead_ids },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
