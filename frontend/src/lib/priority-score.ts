/**
 * Composite priority score — prototype baseline.
 *
 *   priority = fit × volume_potential
 *
 *   fit              = (lead.score || 0) × menu_fit_multiplier
 *   volume_potential = clamp(0..10) of (category_base + linkedin_size_boost + multi_site_boost)
 *
 * Tweak the weights / tables below as the team learns which signals correlate
 * with actual reorder volume. Pure functions, no IO — safe to import anywhere.
 */

import type { Lead } from "./types";

const CATEGORY_VOLUME: Record<string, number> = {
  restaurant_groups: 10,
  hotel_bar: 9,
  airlines_trains: 9,
  membership_clubs: 8,
  festival_operators: 8,
  events_catering: 8,
  film_tv_theatre: 7,
  cookery_schools: 7,
  yacht_charter: 7,
  corporate_gifting: 7,
  wholesaler: 7,
  subscription_boxes: 6,
  cocktail_bar: 6,
  wine_bar: 6,
  italian_restaurant: 5,
  gastropub: 5,
  rtd: 5,
  grocery: 5,
  bottle_shop: 4,
  luxury_food_retail: 4,
  deli_farm_shop: 3,
};
const CATEGORY_VOLUME_DEFAULT = 4;

const MULTI_SITE_KEYWORDS = [
  "group",
  "groups",
  "locations",
  "chain",
  "sites",
  "venues across",
  "venues in",
  "portfolio",
  "across london",
  "across the uk",
  "multi-site",
  "branches",
];

function linkedinSizeBoost(size: string | null | undefined): number {
  if (!size) return 0;
  const s = size.toLowerCase();
  if (s.includes("10,001+") || s.includes("5001-10000") || s.includes("5,001")) return 3;
  if (s.includes("1001-5000") || s.includes("1,001")) return 2;
  if (s.includes("501-1000") || s.includes("201-500")) return 1.5;
  if (s.includes("51-200")) return 1;
  if (s.includes("11-50")) return 0.5;
  return 0;
}

function multiSiteBoost(summary: string | null | undefined): number {
  if (!summary) return 0;
  const s = summary.toLowerCase();
  let hits = 0;
  for (const kw of MULTI_SITE_KEYWORDS) {
    if (s.includes(kw)) hits += 1;
  }
  if (hits === 0) return 0;
  if (hits === 1) return 1;
  return 2;
}

export function volumePotential(lead: Pick<Lead, "venue_category" | "category" | "linkedin_company_size" | "business_summary">): number {
  // Fall back to the legacy `category` field so older leads (enriched before
  // venue_category existed) still get correct category-weighted scoring
  // instead of dropping to CATEGORY_VOLUME_DEFAULT.
  const cat = lead.venue_category ?? lead.category ?? "";
  const base = CATEGORY_VOLUME[cat] ?? CATEGORY_VOLUME_DEFAULT;
  const size = linkedinSizeBoost(lead.linkedin_company_size);
  const multi = multiSiteBoost(lead.business_summary);
  return Math.min(10, base + size + multi);
}

export function priorityScore(lead: Pick<Lead, "score" | "venue_category" | "category" | "linkedin_company_size" | "business_summary" | "menu_fit">): number {
  const rawFit = typeof lead.score === "number" && Number.isFinite(lead.score) ? lead.score : 0;
  const fitTier = lead.menu_fit ?? "unknown";
  const fitMultiplier = fitTier === "strong" ? 1.15 : fitTier === "weak" ? 0.7 : 1;
  const fit = rawFit * fitMultiplier;
  const volume = volumePotential(lead);
  return Math.round(fit * volume * 10) / 10;
}

export type PriorityTier = "high" | "medium" | "low";

export function priorityTier(score: number): PriorityTier {
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export const PRIORITY_TIER_LABEL: Record<PriorityTier, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

export const PRIORITY_TIER_CLASS: Record<PriorityTier, string> = {
  high: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  low: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};
