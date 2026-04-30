import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vpsApi, hasVps } from "@/lib/vps-api";

export interface SearchQueries {
  google_maps: string[];
  google_search: string[];
  bing_search: string[];
  directory: string[];
}

async function proxyGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  return res.json() as Promise<T>;
}

async function proxyPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  return res.json() as Promise<T>;
}

async function proxyPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  return res.json() as Promise<T>;
}

export function useSearchQueries() {
  return useQuery({
    queryKey: ["search-queries"],
    queryFn: () => proxyGet<SearchQueries>("/api/search-queries"),
    enabled: hasVps,
  });
}

export function useUpdateSearchQueries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (queries: SearchQueries) => proxyPut("/api/search-queries", queries),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["search-queries"] }),
  });
}

export function useImportQueries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { source: string; queries: string[] }) =>
      proxyPost("/api/search-queries/import", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["search-queries"] }),
  });
}
