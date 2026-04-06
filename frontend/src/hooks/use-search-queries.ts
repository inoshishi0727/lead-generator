import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SearchQueries {
  google_maps: string[];
  google_search: string[];
  bing_search: string[];
  directory: string[];
}

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;

export function useSearchQueries() {
  return useQuery({
    queryKey: ["search-queries"],
    queryFn: () => api.get<SearchQueries>("/api/search-queries"),
    enabled: hasBackend,
  });
}

export function useUpdateSearchQueries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (queries: SearchQueries) =>
      api.put("/api/search-queries", queries),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["search-queries"] }),
  });
}

export function useImportQueries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { source: string; queries: string[] }) =>
      api.post("/api/search-queries/import", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["search-queries"] }),
  });
}
