import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ConfigData } from "@/lib/types";

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<ConfigData>("/api/config"),
  });
}
