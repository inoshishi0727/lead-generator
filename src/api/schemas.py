"""Request / response schemas for the FastAPI backend."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ScrapeRequest(BaseModel):
    query: str = Field(default="", description="Single Google Maps search query (legacy)")
    queries: list[str] = Field(default=[], description="Multiple queries to run in parallel")
    limit: int = Field(default=10, ge=1, le=200, description="Max leads to collect")
    headless: bool = Field(default=False, description="Run browser in visible mode")


class ScrapeStatusResponse(BaseModel):
    run_id: str
    status: str  # pending | running | completed | failed
    leads_found: int = 0
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    phase: Optional[str] = None  # warmup | scrolling | extracting | saving
    progress: int = 0  # 0-100 percentage
    cards_found: int = 0  # total cards discovered during scroll
    current_lead: Optional[str] = None  # business name currently being processed


class ConfigResponse(BaseModel):
    env_vars: dict[str, bool]
    search_queries: list[str]


class LeadResponse(BaseModel):
    id: str
    business_name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    email_found: bool = False
    source: Optional[str] = None
    stage: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    category: Optional[str] = None
    scraped_at: Optional[datetime] = None
    score: Optional[int] = None
    venue_category: Optional[str] = None
    menu_fit: Optional[str] = None
    tone_tier: Optional[str] = None
    lead_products: list[str] = []
    enrichment_status: Optional[str] = None
    context_notes: Optional[str] = None
    business_summary: Optional[str] = None
    drinks_programme: Optional[str] = None
    why_asterley_fits: Optional[str] = None
    opening_hours_summary: Optional[str] = None
    price_tier: Optional[str] = None
    menu_fit_signals: list[str] = []
    ai_approval: Optional[str] = None
    ai_approval_reason: Optional[str] = None
    # Extended fields
    google_maps_place_id: Optional[str] = None
    location_postcode: Optional[str] = None
    location_city: Optional[str] = None
    location_area: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_role: Optional[str] = None
    contact_confidence: Optional[str] = None
    email_domain: Optional[str] = None
    client_status: Optional[str] = None
    rejection_reason: Optional[str] = None
    batch_id: Optional[str] = None


class LeadDetailResponse(LeadResponse):
    """Full lead detail including enrichment breakdown and outreach messages."""
    menu_fit_signals: list[str] = []
    opening_hours: Optional[dict] = None
    instagram_handle: Optional[str] = None
    instagram_followers: Optional[int] = None
    instagram_bio: Optional[str] = None
    provider_qa_status: Optional[str] = None
    provider_qa_notes: Optional[str] = None
    score_breakdown: Optional[dict] = None
    outreach_messages: list["OutreachMessageResponse"] = []


# --- Enrichment ---


class EnrichRequest(BaseModel):
    lead_ids: Optional[list[str]] = None
    limit: Optional[int] = None  # Only enrich this many leads (most recent first)
    force: bool = False  # Re-enrich leads even if already enriched


class EnrichStatusResponse(BaseModel):
    run_id: str
    status: str  # pending | running | completed | failed
    total: int = 0
    enriched: int = 0
    failed: int = 0
    skipped: int = 0


# --- Scoring ---


class ScoreStatusResponse(BaseModel):
    total: int = 0
    scored: int = 0
    above_threshold: int = 0
    below_threshold: int = 0


# --- Analytics ---


class FunnelStage(BaseModel):
    name: str
    count: int
    conversion_rate: float = 0.0


class FunnelResponse(BaseModel):
    stages: list[FunnelStage]
    total_leads: int


class CategoryStat(BaseModel):
    category: str
    count: int
    avg_score: float = 0.0
    response_rate: float = 0.0
    conversion_rate: float = 0.0


class CategoryStatsResponse(BaseModel):
    categories: list[CategoryStat]


class RatioComparison(BaseModel):
    category: str
    target: float
    actual: float
    delta: float


class RatioComparisonResponse(BaseModel):
    ratios: list[RatioComparison]


class RatioUpdateRequest(BaseModel):
    ratios: dict[str, float]


class QuerySuggestionResponse(BaseModel):
    suggestions: list[dict]


class TrendPoint(BaseModel):
    period: str
    scraped: int = 0
    enriched: int = 0
    scored: int = 0
    sent: int = 0
    converted: int = 0


class TrendsResponse(BaseModel):
    series: list[TrendPoint]


# --- AI Recommendations ---


class StrategyInsight(BaseModel):
    title: str
    description: str
    action: str
    priority: str  # high | medium | low
    category: Optional[str] = None


class RatioAdjustment(BaseModel):
    category: str
    current_ratio: float
    recommended_ratio: float
    reason: str


class StrategyResponse(BaseModel):
    insights: list[StrategyInsight] = []
    ratio_adjustments: list[RatioAdjustment] = []
    query_suggestions: list[str] = []
    generated_at: Optional[datetime] = None


class LeadRecommendation(BaseModel):
    lead_id: str
    lead_product: str
    outreach_channel: str
    tone_tier: str
    timing_note: str
    opening_hook: str
    confidence: float = 0.0


# --- Outreach Drafting ---


class GenerateDraftsRequest(BaseModel):
    lead_ids: Optional[list[str]] = None


class GenerateDraftsStatusResponse(BaseModel):
    run_id: str
    status: str  # pending | running | completed | failed
    total: int = 0
    generated: int = 0
    failed: int = 0


class OutreachMessageResponse(BaseModel):
    id: str
    lead_id: str
    business_name: str = ""
    venue_category: Optional[str] = None
    channel: str
    subject: Optional[str] = None
    content: str
    status: str
    step_number: int = 1
    created_at: Optional[datetime] = None
    tone_tier: Optional[str] = None
    lead_products: list[str] = []
    contact_name: Optional[str] = None
    context_notes: Optional[str] = None
    menu_fit: Optional[str] = None


class UpdateMessageRequest(BaseModel):
    status: Optional[str] = None  # approved | rejected
    content: Optional[str] = None
    subject: Optional[str] = None


class BatchApproveRequest(BaseModel):
    message_ids: list[str]


class SendRequest(BaseModel):
    force: bool = Field(default=False, description="Send even outside optimal window")


class SendStatusResponse(BaseModel):
    run_id: str
    status: str  # pending | running | completed | failed
    total: int = 0
    sent: int = 0
    failed: int = 0
    outside_optimal_window: bool = False


class GenerateFollowupsStatusResponse(BaseModel):
    run_id: str
    status: str  # pending | running | completed | failed
    total: int = 0
    generated: int = 0
    failed: int = 0
