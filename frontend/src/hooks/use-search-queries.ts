import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vpsApi, hasVps } from "@/lib/vps-api";

export interface SearchQueries {
  google_maps: string[];
  google_search: string[];
  bing_search: string[];
  directory: string[];
}

export function useSearchQueries() {
  return useQuery({
    queryKey: ["search-queries"],
    queryFn: () => vpsApi.get<SearchQueries>("/api/search-queries"),
    enabled: hasVps,
  });
}

export function useUpdateSearchQueries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (queries: SearchQueries) =>
      vpsApi.put("/api/search-queries", queries),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["search-queries"] }),
  });
}

export function useImportQueries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { source: string; queries: string[] }) =>
      vpsApi.post("/api/search-queries/import", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["search-queries"] }),
  });
}
