import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface ScrapeOneResponse {
  ok: boolean;
  is_new: boolean;
  detected_kind: "gmaps_url" | "website_url" | "name" | string;
  lead_id?: string;
  business_name?: string;
  address?: string;
  phone?: string;
  website?: string;
  error?: string;
}

export function useScrapeOne() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: string): Promise<ScrapeOneResponse> => {
      const res = await fetch("/api/scrape-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = (await res.json().catch(() => ({}))) as ScrapeOneResponse;
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    },
    onSuccess: (data) => {
      if (data.is_new) {
        toast.success(`Added: ${data.business_name}`, {
          description: data.address ?? undefined,
        });
        // Refresh leads list so the new venue shows up.
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      } else {
        toast.info(`Already in your leads: ${data.business_name}`);
      }
    },
    onError: (err: Error) => {
      toast.error("Couldn't add that venue", { description: err.message });
    },
  });
}
