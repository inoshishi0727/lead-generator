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
  score?: number;
  enriched?: boolean;
  scored?: boolean;
  venue_category?: string;
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
      const bits: string[] = [];
      if (data.address) bits.push(data.address);
      if (data.venue_category) bits.push(data.venue_category.replace(/_/g, " "));
      if (typeof data.score === "number") bits.push(`score ${data.score}`);
      if (data.enriched === false) bits.push("enrichment skipped");
      const description = bits.length ? bits.join(" · ") : undefined;

      if (data.is_new) {
        toast.success(`Added: ${data.business_name}`, { description });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      } else {
        toast.info(`Already in your leads: ${data.business_name}`, { description });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      }
    },
    onError: (err: Error) => {
      toast.error("Couldn't add that venue", { description: err.message });
    },
  });
}
