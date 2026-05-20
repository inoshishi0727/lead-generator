"use client";

import { useQuery } from "@tanstack/react-query";
import { getGenerationLog, getMessageGenerationHistory } from "@/lib/firestore-api";

export function useGenerationLog(filters?: { generation_source?: string }) {
  return useQuery({
    queryKey: ["generation-log", filters],
    queryFn: () => getGenerationLog(filters),
    staleTime: 30_000,
  });
}

export function useMessageGenerationHistory(messageId: string | undefined) {
  return useQuery({
    queryKey: ["generation-history", messageId],
    queryFn: () => getMessageGenerationHistory(messageId!),
    enabled: !!messageId,
    staleTime: 10_000,
  });
}
