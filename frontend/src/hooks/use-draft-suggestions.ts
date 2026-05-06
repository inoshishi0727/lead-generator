import { useMutation, useQuery } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { DraftSuggestionsResult } from "@/lib/types";

export function useDraftSuggestions(messageId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["draft-suggestions", messageId],
    queryFn: async () => {
      if (!messageId) throw new Error("message_id required");
      const fn = httpsCallable<{ message_id: string }, DraftSuggestionsResult>(
        functions,
        "suggestDraftImprovements"
      );
      const result = await fn({ message_id: messageId });
      return result.data;
    },
    enabled: !!messageId && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useAggregateOutreachStats() {
  return useMutation({
    mutationFn: async () => {
      const fn = httpsCallable<
        Record<string, never>,
        { segments_written: number; messages_scanned: number }
      >(functions, "aggregateOutreachStats");
      const result = await fn({});
      return result.data;
    },
  });
}
