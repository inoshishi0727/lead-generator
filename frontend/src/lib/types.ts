export interface ScrapeRequest {
  query?: string;
  queries?: string[];
  limit: number;
  headless: boolean;
}

export interface ScrapeStatus {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed";
  leads_found: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  phase: string | null;
  progress: number;
  cards_found: number;
  current_lead: string | null;
}

export interface ConfigData {
  env_vars: Record<string, boolean>;
  search_queries: string[];
}

export interface Lead {
  id: string;
  business_name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  email_found: boolean;
  source: string | null;
  stage: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  scraped_at: string | null;
  score: number | null;
  venue_category: string | null;
  menu_fit: string | null;
  tone_tier: string | null;
  lead_products: string[];
  enrichment_status: string | null;
  context_notes: string | null;
  business_summary: string | null;
  drinks_programme: string | null;
  why_asterley_fits: string | null;
  opening_hours_summary: string | null;
  price_tier: string | null;
  menu_fit_signals: string[];
  ai_approval: string | null;
  ai_approval_reason: string | null;
  google_maps_place_id: string | null;
  location_postcode: string | null;
  location_city: string | null;
  location_area: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
  contact_confidence: string | null;
  email_domain: string | null;
  client_status: string | null;
  rejection_reason: string | null;
  rejection_notes: string | null;
  batch_id: string | null;
  // Reply tracking
  human_takeover: boolean;
  human_takeover_at: string | null;
  outcome: LeadOutcome | null;
  outcome_updated_at: string | null;
  reply_count: number;
}

export interface LeadDetail extends Lead {
  menu_fit_signals: string[];
  opening_hours: Record<string, unknown> | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  instagram_bio: string | null;
  provider_qa_status: string | null;
  provider_qa_notes: string | null;
  score_breakdown: Record<string, { points: number; reason: string }> | null;
  outreach_messages: OutreachMessage[];
}

// --- Outreach ---

export interface OutreachMessage {
  id: string;
  lead_id: string;
  business_name: string;
  venue_category: string | null;
  channel: "email" | "instagram_dm";
  subject: string | null;
  content: string;
  status: "draft" | "approved" | "rejected" | "sent" | "planned";
  step_number: number;
  follow_up_label: string | null;
  scheduled_send_date: string | null;
  created_at: string | null;
  tone_tier: string | null;
  lead_products: string[];
  contact_name: string | null;
  context_notes: string | null;
  menu_fit: string | null;
  recipient_email: string | null;
  website: string | null;
  original_content?: string;
  original_subject?: string;
  was_edited?: boolean;
  edited_at?: string | null;
  rejection_reason?: string | null;
  has_reply?: boolean;
  reply_count?: number;
  sent_at?: string | null;
  postmark_message_id?: string;
  email_message_id?: string;
  reply_to_address?: string;
  variant?: "A" | "B" | null;
  // Email tracking
  opened?: boolean;
  opened_at?: string | null;
  open_count?: number;
  last_opened_at?: string | null;
  delivered?: boolean;
  delivered_at?: string | null;
  // Follow-up threading
  parent_email_message_id?: string | null;
}

// --- Edit Feedback / Reflection ---

export type ReflectionCategory =
  | "tone"
  | "product_focus"
  | "length"
  | "personalization"
  | "factual_error"
  | "structure"
  | "other";

export interface EditFeedback {
  id: string;
  message_id: string;
  lead_id: string | null;
  channel: string | null;
  venue_category: string | null;
  tone_tier: string | null;
  step_number: number | null;
  lead_products: string[];
  original_content: string;
  edited_content: string;
  original_subject: string | null;
  edited_subject: string | null;
  created_at: string;
  reflection_category: ReflectionCategory | null;
  reflection_note: string | null;
  reflected_at: string | null;
}

// --- Reply Tracking ---

export type LeadOutcome = "ongoing" | "converted" | "lost" | "not_interested" | "snoozed";

export interface InboundReply {
  id: string;
  lead_id: string | null;
  message_id: string | null;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body: string;
  source: "email_forward" | "manual" | "resend" | "outbound_reply";
  direction: "inbound" | "outbound";
  matched: boolean;
  created_at: string;
  forwarded_by: string | null;
  sentiment?: "positive" | "negative" | "neutral" | null;
  sentiment_reason?: string | null;
}

// --- Analytics ---

export interface FunnelStage {
  name: string;
  count: number;
  conversion_rate: number;
}

export interface FunnelData {
  stages: FunnelStage[];
  total_leads: number;
}

export interface CategoryStat {
  category: string;
  count: number;
  avg_score: number;
  response_rate: number;
  conversion_rate: number;
}

export interface RatioComparison {
  category: string;
  target: number;
  actual: number;
  delta: number;
}

export interface TrendPoint {
  period: string;
  scraped: number;
  enriched: number;
  scored: number;
  sent: number;
  converted: number;
}

export interface ReplyRateTrendPoint {
  week: string;
  sent: number;
  replied: number;
  reply_rate: number;
}

export interface ReplyRateByDimensionPoint {
  label: string;
  sent: number;
  replied: number;
  reply_rate: number;
}

// --- AI Recommendations ---

export interface StrategyInsight {
  title: string;
  description: string;
  action: string;
  priority: "high" | "medium" | "low";
  category: string | null;
}

export interface RatioAdjustment {
  category: string;
  current_ratio: number;
  recommended_ratio: number;
  reason: string;
}

export interface StrategyResponse {
  insights: StrategyInsight[];
  ratio_adjustments: RatioAdjustment[];
  query_suggestions: string[];
  generated_at: string | null;
}

export interface SubjectLineStat {
  subject: string;
  sent: number;
  replied: number;
  reply_rate: number;
}

export interface LeadRecommendation {
  lead_id: string;
  lead_product: string;
  outreach_channel: string;
  tone_tier: string;
  timing_note: string;
  opening_hook: string;
  confidence: number;
}
