import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWeeklyEdits, saveReflection, clearReflection } from "@/lib/firestore-api";
import type { ReflectionCategory } from "@/lib/types";

export function useWeeklyEdits() {
  return useQuery({
    queryKey: ["edit-feedback", "weekly"],
    queryFn: () => getWeeklyEdits(7),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useUnreflectedCount() {
  return useQuery({
    queryKey: ["edit-feedback", "weekly"],
    queryFn: () => getWeeklyEdits(7),
    select: (data) => data.filter((d) => !d.reflected_at).length,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useSaveReflection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      feedbackId,
      category,
      note,
    }: {
      feedbackId: string;
      category: ReflectionCategory;
      note: string | null;
    }) => {
      await saveReflection(feedbackId, category, note);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["edit-feedback"] });
    },
  });
}

export function useClearReflection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (feedbackId: string) => {
      await clearReflection(feedbackId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["edit-feedback"] });
    },
  });
}
