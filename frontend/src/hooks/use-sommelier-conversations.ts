import { useQuery } from "@tanstack/react-query";
import {
  getSommelierConversations,
  getSommelierConversation,
} from "@/lib/firestore-api";

export interface ConversationFilters {
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export function useSommelierConversations(filters?: ConversationFilters) {
  return useQuery({
    queryKey: ["sommelier_conversations", filters],
    queryFn: () => getSommelierConversations(filters),
    refetchInterval: 30_000,
  });
}

export function useSommelierConversation(sessionId: string | null) {
  return useQuery({
    queryKey: ["sommelier_conversation", sessionId],
    queryFn: () => getSommelierConversation(sessionId!),
    enabled: !!sessionId,
  });
}
