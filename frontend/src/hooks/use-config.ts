import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ConfigData } from "@/lib/types";

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () =>
      hasBackend
        ? api.get<ConfigData>("/api/config")
        : Promise.resolve({ env_vars: {}, search_queries: [] } as ConfigData),
    enabled: hasBackend,
  });
}
