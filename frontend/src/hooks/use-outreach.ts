import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { api } from "@/lib/api";
import { getOutreachMessages, updateOutreachMessage } from "@/lib/firestore-api";
import { addJob } from "@/lib/job-store";
import type { OutreachMessage } from "@/lib/types";

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;

export interface MessageFilters {
  status?: string;
  channel?: string;
  lead_id?: string;
}

export function useMessages(filters?: MessageFilters, limit: number = 50) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.channel) params.set("channel", filters.channel);
  if (filters?.lead_id) params.set("lead_id", filters.lead_id);
  params.set("limit", String(limit));
  const qs = params.toString();
  const path = `/api/outreach/messages?${qs}`;

  return useQuery({
    queryKey: ["outreach", "messages", filters, limit],
    queryFn: () =>
      hasBackend
        ? api.get<OutreachMessage[]>(path)
        : getOutreachMessages({ ...filters, limit }),
  });
}

export function useGenerateDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leadIds?: string[]) => {
      if (hasBackend) {
        return api.post<{ run_id: string; status: string }>(
          "/api/outreach/generate",
          { lead_ids: leadIds ?? null }
        );
      }
      const fn = httpsCallable<
        { lead_ids?: string[] },
        { generated: number; failed: number; total: number }
      >(functions, "generateDrafts");
      const result = await fn({ lead_ids: leadIds });
      return { run_id: "", status: "completed", ...result.data };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useRegenerateAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (hasBackend) {
        return api.post<{ run_id: string; status: string }>(
          "/api/outreach/regenerate-all",
          {}
        );
      }
      const fn = httpsCallable<
        Record<string, never>,
        { generated: number; failed: number; total: number }
      >(functions, "regenerateAllDrafts");
      const result = await fn({});
      return { run_id: "", status: "completed", ...result.data };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useUpdateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      status?: string;
      content?: string;
      subject?: string;
    }) => {
      if (hasBackend) {
        return api.patch<OutreachMessage>(`/api/outreach/messages/${id}`, body);
      }
      await updateOutreachMessage(id, body);
      return { id, ...body } as unknown as OutreachMessage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useRegenerateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (hasBackend) {
        return api.post<OutreachMessage>(
          `/api/outreach/messages/${id}/regenerate`,
          {}
        );
      }
      // Get the message to find lead_id
      const msgs = await getOutreachMessages({ lead_id: undefined, limit: 500 });
      const msg = msgs.find((m) => m.id === id);
      if (!msg) throw new Error("Message not found");

      const fn = httpsCallable<
        { message_id: string; lead_id: string },
        { message_id: string; subject: string; content: string }
      >(functions, "regenerateDraft");
      const result = await fn({ message_id: id, lead_id: msg.lead_id });
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useBatchApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (hasBackend) {
        return api.post<{ approved: number }>("/api/outreach/approve-batch", {
          message_ids: messageIds,
        });
      }
      // Client-side batch approve
      let approved = 0;
      for (const id of messageIds) {
        await updateOutreachMessage(id, { status: "approved" });
        approved++;
      }
      return { approved };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export interface SendResponse {
  run_id: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  outside_optimal_window: boolean;
}

export function useSendApproved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (force: boolean = false) => {
      if (hasBackend) {
        return api.post<SendResponse>("/api/outreach/send", { force });
      }
      const fn = httpsCallable<
        { force?: boolean },
        SendResponse
      >(functions, "sendApproved");
      const result = await fn({ force });
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const fn = httpsCallable<
        { force: boolean; message_ids: string[] },
        SendResponse
      >(functions, "sendApproved");
      const result = await fn({ force: true, message_ids: [messageId] });
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useGenerateFollowups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ run_id: string; status: string }>(
        "/api/outreach/generate-followups",
        {}
      ),
    onSuccess: (data) => {
      addJob("followups", data.run_id);
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}
