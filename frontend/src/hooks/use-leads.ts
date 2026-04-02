import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getLeads, createLead } from "@/lib/firestore-api";
import type { Lead } from "@/lib/types";

const useFirestore = !process.env.NEXT_PUBLIC_API_URL;

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
      useFirestore ? getLeads(filters) : api.get<Lead[]>(path),
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
        const err = await res.json();
        throw new Error(err.error || "Enrichment failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
