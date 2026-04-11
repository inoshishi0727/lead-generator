import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { api } from "@/lib/api";
import { getOutreachMessages, updateOutreachMessage, restoreOriginalEmail, getInboundReplies, deleteInboundReply, deleteOutreachMessage } from "@/lib/firestore-api";
import type { OutreachMessage, InboundReply } from "@/lib/types";

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;

export interface MessageFilters {
  status?: string;
  channel?: string;
  lead_id?: string;
  assignedTo?: string;
}

export function useMessages(filters?: MessageFilters, limit: number = 200) {
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
        : getOutreachMessages({ ...filters, limit, assignedTo: filters?.assignedTo }),
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
      restore_original_email,
      ...body
    }: {
      id: string;
      status?: string;
      content?: string;
      subject?: string;
      restore_original_email?: boolean;
      rejection_reason?: string;
      lead_id?: string;
    }) => {
      if (hasBackend) {
        return api.patch<OutreachMessage>(`/api/outreach/messages/${id}`, body);
      }
      if (restore_original_email) {
        await restoreOriginalEmail(id);
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
    mutationFn: async ({
      id,
      style,
      preview,
    }: {
      id: string;
      style?: "default" | "flowing";
      preview?: boolean;
    }) => {
      if (hasBackend) {
        return api.post<OutreachMessage>(
          `/api/outreach/messages/${id}/regenerate`,
          { style, preview }
        );
      }
      const msgs = await getOutreachMessages({ lead_id: undefined, limit: 500 });
      const msg = msgs.find((m) => m.id === id);
      if (!msg) throw new Error("Message not found");

      const fn = httpsCallable<
        { message_id: string; lead_id: string; style?: string; preview?: boolean },
        { message_id: string; subject: string; content: string }
      >(functions, "regenerateDraft");
      const result = await fn({ message_id: id, lead_id: msg.lead_id, style, preview });
      return { ...result.data, preview: preview ?? false };
    },
    onSuccess: (data) => {
      if (!("preview" in data) || !data.preview) {
        qc.invalidateQueries({ queryKey: ["outreach"] });
      }
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
  skipped_scheduled?: number;
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
    mutationFn: async () => {
      if (hasBackend) {
        return api.post<{ generated: number; skipped: number; failed: number; total: number }>(
          "/api/outreach/generate-followups",
          {}
        );
      }
      const fn = httpsCallable<
        Record<string, never>,
        { generated: number; skipped: number; failed: number; total: number }
      >(functions, "generateFollowups");
      const result = await fn({});
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useGenerateFollowupForLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, force }: { leadId: string; force?: boolean }) => {
      const fn = httpsCallable<
        { lead_ids?: string[]; force?: boolean },
        { generated: number; skipped: number; failed: number; total: number }
      >(functions, "generateFollowups");
      const result = await fn({ lead_ids: [leadId], force: force ?? false });
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

// ---- Reply Tracking Hooks ----

export function useLogReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { lead_id: string; message_id?: string; notes?: string }) => {
      const fn = httpsCallable<
        { lead_id: string; message_id?: string; notes?: string },
        { reply_id: string; status: string }
      >(functions, "logReply");
      const result = await fn(params);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
      qc.invalidateQueries({ queryKey: ["inbound-replies"] });
    },
  });
}

export function useUpdateLeadOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { lead_id: string; outcome: string }) => {
      const fn = httpsCallable<
        { lead_id: string; outcome: string },
        { status: string; outcome: string }
      >(functions, "updateLeadOutcome");
      const result = await fn(params);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useAssignReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { reply_id: string; lead_id: string }) => {
      const fn = httpsCallable<
        { reply_id: string; lead_id: string },
        { status: string }
      >(functions, "assignReplyToLead");
      const result = await fn(params);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbound-replies"] });
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useInboundReplies(
  filters?: { lead_id?: string; matched?: boolean },
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["inbound-replies", filters],
    queryFn: () => getInboundReplies(filters),
    enabled: options?.enabled ?? true,
  });
}

export function useSendReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      lead_id: string;
      message_id: string;
      content: string;
    }) => {
      const fn = httpsCallable<
        { lead_id: string; message_id: string; content: string },
        { reply_id: string; status: string }
      >(functions, "sendReply");
      const result = await fn(params);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbound-replies"] });
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteOutreachMessage(messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useDeleteReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (replyId: string) => deleteInboundReply(replyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbound-replies"] });
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}
