import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface OutreachLead {
  lead_id: string;
  business_name: string;
  venue_category: string;
  email: string;
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
  total_eligible: number;
  recommended: OutreachLead[];
  weekly_target: number;
  weekly_progress: WeeklyProgress;
  scrape_recommendations: ScrapeRecommendation[];
  generated_at: string;
}

export type { OutreachPlan, OutreachLead };

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;

export function useOutreachPlan(limit: number = 15) {
  return useQuery({
    queryKey: ["recommendations", "outreach-plan", limit],
    queryFn: () =>
      api.get<OutreachPlan>(
        `/api/recommendations/outreach-plan?limit=${limit}`
      ),
    staleTime: 10 * 60 * 1000,
    enabled: hasBackend,
  });
}
