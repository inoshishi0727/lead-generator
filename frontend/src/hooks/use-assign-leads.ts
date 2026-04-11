import { useMutation, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

interface AssignResult {
  status: string;
  assigned: number;
  assigned_to: string;
  assigned_to_name: string;
}

interface UnassignResult {
  status: string;
  unassigned: number;
}

export function useAssignLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { lead_ids: string[]; assigned_to: string }) => {
      const fn = httpsCallable<
        { lead_ids: string[]; assigned_to: string },
        AssignResult
      >(functions, "assignLeads");
      const result = await fn(params);
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}

export function useUnassignLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lead_ids: string[]) => {
      const fn = httpsCallable<
        { lead_ids: string[] },
        UnassignResult
      >(functions, "unassignLeads");
      const result = await fn({ lead_ids });
      return result.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["outreach"] });
    },
  });
}
