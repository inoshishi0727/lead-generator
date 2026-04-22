import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { api } from "@/lib/api";
import { getOutreachMessages, updateOutreachMessage, restoreOriginalEmail, getInboundReplies, deleteInboundReply, deleteOutreachMessage, getCampaigns, updateCampaign, bulkSetScheduledSendDate } from "@/lib/firestore-api";
import type { OutreachMessage, InboundReply, Campaign } from "@/lib/types";

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

export class DuplicateLiveOutreachError extends Error {
  constructor(public businessName: string) {
    super(`${businessName} already has a live email outreach`);
    this.name = "DuplicateLiveOutreachError";
  }
}

export function useUpdateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      restore_original_email,
      business_name,
      step_number,
      channel,
      ...body
    }: {
      id: string;
      status?: string;
      content?: string;
      subject?: string;
      restore_original_email?: boolean;
      rejection_reason?: string;
      lead_id?: string;
<<<<<<< HEAD
      scheduled_send_date?: string | null;
=======
      // Optional — used only when status="approved" to enforce the
      // "one live email per (lead, step)" singleton.
      step_number?: number;
      channel?: string;
      business_name?: string;
>>>>>>> d5925e1 (feat: prevent duplicate live outreach emails across UI and functions)
    }) => {
      if (body.status === "approved" && channel === "email" && body.lead_id) {
        const siblings = await getOutreachMessages({ status: "approved", channel: "email", limit: 500 });
        const conflict = siblings.find(
          (m) => m.lead_id === body.lead_id && (m.step_number ?? 1) === (step_number ?? 1) && m.id !== id
        );
        if (conflict) {
          throw new DuplicateLiveOutreachError(business_name || "This lead");
        }
      }

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

export function useApprovedEmailCount() {
  return useQuery({
    queryKey: ["outreach", "approved-email-count"],
    queryFn: async () => {
      const messages = await getOutreachMessages({ status: "approved", channel: "email", limit: 25 });
      return messages.length;
    },
  });
}

export function useBatchApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageIds: string[]) => {
      // Fetch approved emails (for the 20-cap) and the candidate drafts so we
      // can enforce "one live email per (lead, step)". A lead already covered
      // by another approved email must not get a second approval.
      const [approvedEmails, draftEmails] = await Promise.all([
        getOutreachMessages({ status: "approved", channel: "email", limit: 500 }),
        getOutreachMessages({ status: "draft", channel: "email", limit: 500 }),
      ]);
      const currentApprovedCount = approvedEmails.length;

      const approvedKeys = new Set(
        approvedEmails.map((m) => `${m.lead_id}:${m.step_number ?? 1}`)
      );
      const draftsById = new Map(draftEmails.map((m) => [m.id, m] as const));

      let skippedDuplicates = 0;
      const keysClaimed = new Set<string>();
      const eligible: string[] = [];
      for (const id of messageIds) {
        const msg = draftsById.get(id);
        if (!msg) continue; // not a live email draft — let the update fail/skip silently
        const key = `${msg.lead_id}:${msg.step_number ?? 1}`;
        if (approvedKeys.has(key) || keysClaimed.has(key)) {
          skippedDuplicates++;
          continue;
        }
        keysClaimed.add(key);
        eligible.push(id);
      }

      const slots = Math.max(0, 20 - currentApprovedCount);
      const toApprove = eligible.slice(0, slots);
      const capped = toApprove.length < eligible.length;

      if (hasBackend) {
        const res = await api.post<{ approved: number; capped: boolean }>(
          "/api/outreach/approve-batch",
          { message_ids: toApprove }
        );
        return { ...res, skipped_duplicates: skippedDuplicates };
      }

      let approved = 0;
      for (const id of toApprove) {
        await updateOutreachMessage(id, { status: "approved" });
        approved++;
      }
      return { approved, capped, skipped_duplicates: skippedDuplicates };
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

export function useSendMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageIds: string[]) => {
      const fn = httpsCallable<
        { force: boolean; message_ids: string[] },
        SendResponse
      >(functions, "sendApproved");
      const result = await fn({ force: true, message_ids: messageIds });
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
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

export function useGenerateClientDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      lead_ids: string[];
      campaign_type?: string;
      campaign_id?: string;
    }) => {
      const fn = httpsCallable<
        { lead_ids: string[]; campaign_type?: string; campaign_id?: string },
        { generated: number; failed: number; total: number }
      >(functions, "generateClientDrafts");
      const result = await fn(params);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useCampaignDrafts(campaignId: string) {
  return useQuery({
    queryKey: ["outreach", "campaign", campaignId],
    queryFn: () => getOutreachMessages({ campaign_id: campaignId, limit: 100 }),
    enabled: !!campaignId,
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns"],
    queryFn: getCampaigns,
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Campaign>) => {
      await updateCampaign(id, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useRegenerateCampaignBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const fn = httpsCallable<{ campaign_id: string }, { brief: string }>(
        functions,
        "regenerateCampaignBrief"
      );
      const result = await fn({ campaign_id: campaignId });
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useApproveCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const fn = httpsCallable<{ campaign_id: string }, { status: string; approved_at: string }>(
        functions,
        "approveCampaign"
      );
      const result = await fn({ campaign_id: campaignId });
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { campaign_type: string; extra_context?: string; lead_product?: string; send_date?: string }) => {
      const fn = httpsCallable<
        { campaign_type: string; extra_context?: string; lead_product?: string; send_date?: string },
        Campaign
      >(functions, "createCampaign");
      const result = await fn(params);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}

export function useScheduleCampaignDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageIds, sendDate }: { messageIds: string[]; sendDate: string }) => {
      await bulkSetScheduledSendDate(messageIds, sendDate);
      return { scheduled: messageIds.length };
    },
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
