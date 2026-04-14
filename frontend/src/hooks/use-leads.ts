import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getLeads, createLead } from "@/lib/firestore-api";
import { vpsApi } from "@/lib/vps-api";
import type { Lead } from "@/lib/types";

export interface LeadFilters {
  source?: string;
  stage?: string;
  search?: string;
  assignedTo?: string;
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
      getLeads({
        source: filters?.source,
        stage: filters?.stage,
        search: filters?.search,
        assignedTo: filters?.assignedTo,
      }),
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
    mutationFn: async (opts?: { force?: boolean }) => {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: opts?.force ?? false }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text);
      }
      return res.json() as Promise<{ status: string; enriched: number; failed: number }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
