import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface QuickAddResponse {
  added: number;
  duplicate: number;
  lead_ids: string[];
  error?: string;
}

/**
 * Insert pasted strings as skeleton leads (no scrape). Fast — sub-second
 * even for 200 inputs.
 */
export function useQuickAdd() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inputs: string[]): Promise<QuickAddResponse> => {
      const res = await fetch("/api/leads/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });
      const data = (await res.json().catch(() => ({}))) as QuickAddResponse;
      if (!res.ok || typeof data.added !== "number") {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    },
    onSuccess: (data) => {
      const total = data.added + data.duplicate;
      const bits: string[] = [];
      if (data.added) bits.push(`${data.added} added`);
      if (data.duplicate) bits.push(`${data.duplicate} already in list`);
      toast.success(
        `Saved ${total} lead${total === 1 ? "" : "s"}`,
        {
          description:
            (bits.length ? bits.join(" · ") + " · " : "") +
            "Scrape them from the Leads page when ready.",
        }
      );
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: Error) => {
      toast.error("Couldn't add leads", { description: err.message });
    },
  });
}
