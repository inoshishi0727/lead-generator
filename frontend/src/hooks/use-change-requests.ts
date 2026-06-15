"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db, functions } from "@/lib/firebase";

export interface PromptChangeRequest {
  id: string;
  requested_by: string;
  request: string;
  agent_reason: string;
  proposed_edit: string;
  target_layer: "base" | "synthesized_rules";
  simulation_sample?: { lead_id: string; subject: string; content: string } | null;
  status: "open" | "approved" | "declined";
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
  materialized_version_id?: string;
}

export function useOpenChangeRequests() {
  return useQuery<PromptChangeRequest[]>({
    queryKey: ["prompt-change-requests", "open"],
    queryFn: async () => {
      const ref = collection(db, "prompt_change_requests");
      const q = query(ref, where("status", "==", "open"), orderBy("created_at", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as PromptChangeRequest);
    },
  });
}

export function useCreateChangeRequest() {
  const qc = useQueryClient();
  const fn = httpsCallable<
    {
      request: string;
      agent_reason: string;
      proposed_edit: string;
      target_layer: "base" | "synthesized_rules";
      simulation_sample?: { lead_id: string; subject: string; content: string };
    },
    { status: string; id: string }
  >(functions, "createPromptChangeRequest");
  return useMutation({
    mutationFn: async (input: {
      request: string;
      agent_reason: string;
      proposed_edit: string;
      target_layer: "base" | "synthesized_rules";
      simulation_sample?: { lead_id: string; subject: string; content: string };
    }) => (await fn(input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompt-change-requests"] });
    },
  });
}

export function useDecideChangeRequest() {
  const qc = useQueryClient();
  const fn = httpsCallable<
    { id: string; decision: "approved" | "declined"; note?: string },
    { status: string; id: string; decision: string }
  >(functions, "decidePromptChangeRequest");
  return useMutation({
    mutationFn: async (input: { id: string; decision: "approved" | "declined"; note?: string }) =>
      (await fn(input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompt-change-requests"] });
    },
  });
}
