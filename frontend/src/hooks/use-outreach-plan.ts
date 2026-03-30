import { useQuery } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { api } from "@/lib/api";

interface OutreachLead {
  lead_id: string;
  business_name: string;
  venue_category: string;
  email: string | null;
  priority: number;
  reasons: string[];
  lead_products: string[];
  seasonal_hook: string;
  suggested_serves: string;
  contact_name: string | null;
  menu_fit: string;
  score: number | null;
}

interface ScrapeRecommendation {
  category: string;
  priority: number;
  current: number;
  target: number;
  gap: number;
  suggested_leads: number;
  queries: string[];
  reason: string;
}

interface WeeklyProgress {
  total: number;
  remaining: number;
  by_category: Record<string, number>;
}

interface OutreachPlan {
  season: string;
  seasonal_hook: string;
  seasonal_products: string[];
  seasonal_serves: string;
  send_window: {
    status: string;
    label: string;
    day: string;
    time: string;
  };
  ai_summary: string | null;
  total_eligible: number;
  recommended: OutreachLead[];
  weekly_target: number;
  weekly_progress: WeeklyProgress;
  scrape_recommendations: {
    category: string;
    queries: string[];
    suggested_leads: number;
    reason: string;
  }[];
  generated_at: string;
}

export type { OutreachPlan, OutreachLead };

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;

export function useOutreachPlan(limit: number = 10) {
  return useQuery({
    queryKey: ["recommendations", "outreach-plan", limit],
    queryFn: async () => {
      const res = await fetch(`/api/outreach-plan?limit=${limit}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load outreach plan");
      }
      return res.json() as Promise<OutreachPlan>;
    },
    staleTime: 10 * 60 * 1000,
  });
}
