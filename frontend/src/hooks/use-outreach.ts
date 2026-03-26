import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getOutreachMessages, updateOutreachMessage } from "@/lib/firestore-api";
import { addJob } from "@/lib/job-store";
import type { OutreachMessage } from "@/lib/types";

const useFirestore = !process.env.NEXT_PUBLIC_API_URL;

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
      useFirestore
        ? getOutreachMessages({ ...filters, limit })
        : api.get<OutreachMessage[]>(path),
  });
}

export function useGenerateDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leadIds?: string[]) =>
      api.post<{ run_id: string; status: string }>(
        "/api/outreach/generate",
        { lead_ids: leadIds ?? null }
      ),
    onSuccess: (data) => {
      addJob("generate", data.run_id);
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useRegenerateAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ run_id: string; status: string }>(
        "/api/outreach/regenerate-all",
        {}
      ),
    onSuccess: (data) => {
      addJob("generate", data.run_id);
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
      if (useFirestore) {
        await updateOutreachMessage(id, body);
        return { id, ...body } as unknown as OutreachMessage;
      }
      return api.patch<OutreachMessage>(`/api/outreach/messages/${id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useRegenerateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<OutreachMessage>(
        `/api/outreach/messages/${id}/regenerate`,
        {}
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useBatchApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageIds: string[]) =>
      api.post<{ approved: number }>("/api/outreach/approve-batch", {
        message_ids: messageIds,
      }),
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
    mutationFn: (force: boolean = false) =>
      api.post<SendResponse>("/api/outreach/send", { force }),
    onSuccess: (data) => {
      if (data.run_id) {
        addJob("send", data.run_id);
      }
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
