"""Pydantic models for all database tables."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class LeadSource(str, Enum):
    GOOGLE_MAPS = "google_maps"
    GOOGLE_SEARCH = "google_search"
    BING_SEARCH = "bing_search"
    INSTAGRAM = "instagram"
    LINKEDIN = "linkedin"
    TRUSTPILOT = "trustpilot"
    YELL = "yell"
    INDUSTRY_DIRECTORY = "industry_directory"
    APOLLO = "apollo"
    MANUAL = "manual"


class LinkedInConfidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class VenueCategory(str, Enum):
    COCKTAIL_BAR = "cocktail_bar"
    WINE_BAR = "wine_bar"
    ITALIAN_RESTAURANT = "italian_restaurant"
    GASTROPUB = "gastropub"
    HOTEL_BAR = "hotel_bar"
    BOTTLE_SHOP = "bottle_shop"
    DELI_FARM_SHOP = "deli_farm_shop"
    EVENTS_CATERING = "events_catering"
    RTD = "rtd"
    RESTAURANT_GROUPS = "restaurant_groups"
    FESTIVAL_OPERATORS = "festival_operators"
    COOKERY_SCHOOLS = "cookery_schools"
    CORPORATE_GIFTING = "corporate_gifting"
    MEMBERSHIP_CLUBS = "membership_clubs"
    AIRLINES_TRAINS = "airlines_trains"
    SUBSCRIPTION_BOXES = "subscription_boxes"
    FILM_TV_THEATRE = "film_tv_theatre"
    YACHT_CHARTER = "yacht_charter"
    LUXURY_FOOD_RETAIL = "luxury_food_retail"
    GROCERY = "grocery"


class MenuFit(str, Enum):
    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"
    UNKNOWN = "unknown"


class ToneTier(str, Enum):
    BARTENDER_CASUAL = "bartender_casual"
    WARM_PROFESSIONAL = "warm_professional"
    B2B_COMMERCIAL = "b2b_commercial"
    CORPORATE_FORMAL = "corporate_formal"


class PipelineStage(str, Enum):
    SCRAPED = "scraped"
    NEEDS_EMAIL = "needs_email"
    ENRICHED = "enriched"
    SCORED = "scored"
    DRAFT_GENERATED = "draft_generated"
    APPROVED = "approved"
    SENT = "sent"
    FOLLOW_UP_1 = "follow_up_1"
    FOLLOW_UP_2 = "follow_up_2"
    RESPONDED = "responded"
    CONVERTED = "converted"
    DECLINED = "declined"


class OutreachChannel(str, Enum):
    EMAIL = "email"
    INSTAGRAM_DM = "instagram_dm"


class MessageStatus(str, Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    REJECTED = "rejected"
    SENT = "sent"
    DELIVERED = "delivered"
    BOUNCED = "bounced"
    OPENED = "opened"


class RunStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ScoreBreakdownItem(BaseModel):
    points: int
    reason: str


class ContactInfo(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    confidence: Optional[str] = None  # "verified", "likely", "uncertain"


class EnrichmentData(BaseModel):
    venue_category: Optional[VenueCategory] = None
    business_summary: Optional[str] = None
    location_area: Optional[str] = None
    menu_fit: Optional[MenuFit] = None
    menu_fit_signals: list[str] = []
    drinks_programme: Optional[str] = None
    why_asterley_fits: Optional[str] = None
    context_notes: Optional[str] = None
    lead_products: list[str] = []
    tone_tier: Optional[ToneTier] = None
    contact: Optional[ContactInfo] = None
    opening_hours_summary: Optional[str] = None
    price_tier: Optional[str] = None
    menu_url: Optional[str] = None
    ai_approval: Optional[str] = None  # approve / maybe / reject
    ai_approval_reason: Optional[str] = None
    enrichment_source: Optional[str] = None
    enrichment_status: str = "pending"
    enrichment_error: Optional[str] = None


class Lead(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    source: LeadSource
    business_name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    email_found: bool = False
    rating: Optional[float] = None
    review_count: Optional[int] = None
    category: Optional[str] = None
    instagram_handle: Optional[str] = None
    instagram_followers: Optional[int] = None
    instagram_bio: Optional[str] = None
    # Social media (from LinkedIn company page agentic scrape)
    twitter_handle: Optional[str] = None
    facebook_url: Optional[str] = None
    tiktok_handle: Optional[str] = None
    youtube_url: Optional[str] = None
    social_media_scraped_at: Optional[datetime] = None
    # Location fields
    google_maps_place_id: Optional[str] = None
    location_postcode: Optional[str] = None
    location_city: Optional[str] = None
    location_area: Optional[str] = None
    opening_hours: Optional[dict] = None
    # Contact fields (top-level for easy access)
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_role: Optional[str] = None
    contact_confidence: Optional[str] = None  # verified/likely/uncertain/failed
    email_domain: Optional[str] = None
    # Scoring & enrichment
    score: Optional[int] = None
    score_breakdown: Optional[dict[str, ScoreBreakdownItem]] = None
    enrichment: Optional[EnrichmentData] = None
    enriched_at: Optional[datetime] = None
    # LinkedIn employee discovery
    linkedin_company_url: Optional[str] = None
    linkedin_scraped_at: Optional[datetime] = None
    linkedin_employee_count: Optional[int] = None
    linkedin_scrape_status: Optional[str] = None
    # Pipeline & workflow
    stage: PipelineStage = PipelineStage.SCRAPED
    batch_id: Optional[str] = None
    client_status: Optional[str] = None  # pending_review/approved/rejected
    rejection_reason: Optional[str] = None
    provider_qa_status: Optional[str] = None  # qa_passed/qa_flagged/qa_rejected
    provider_qa_notes: Optional[str] = None
    scraped_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class LinkedInCompanyData(BaseModel):
    lead_id: UUID
    company_linkedin_url: Optional[str] = None
    company_linkedin_slug: Optional[str] = None
    company_size: Optional[str] = None
    industry: Optional[str] = None
    hq_address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    instagram_handle: Optional[str] = None
    twitter_handle: Optional[str] = None
    facebook_url: Optional[str] = None
    tiktok_handle: Optional[str] = None
    youtube_url: Optional[str] = None
    scraped_at: datetime = Field(default_factory=datetime.now)


class LinkedInEmployee(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    lead_id: UUID
    company_linkedin_url: Optional[str] = None  # null when sourced from people-search (no company page)
    source: str = "company_people"  # "company_people" | "people_search"
    name: str
    name_lower: str
    profile_url: str
    profile_slug: str
    profile_image_url: Optional[str] = None
    title: Optional[str] = None
    title_lower: Optional[str] = None
    role_seniority: Optional[str] = None
    is_decision_maker: bool = False
    location: Optional[str] = None
    connection_degree: Optional[str] = None
    confidence: LinkedInConfidence = LinkedInConfidence.HIGH
    scraped_at: datetime = Field(default_factory=datetime.now)
    last_seen_at: datetime = Field(default_factory=datetime.now)
    promoted_to_outreach: bool = False
    promoted_at: Optional[datetime] = None
    notes: Optional[str] = None


class OutreachMessage(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    lead_id: UUID
    channel: OutreachChannel
    subject: Optional[str] = None
    content: str
    status: MessageStatus = MessageStatus.DRAFT
    step_number: int = 1
    attempt_number: int = 1
    created_at: datetime = Field(default_factory=datetime.now)
    sent_at: Optional[datetime] = None
    original_content: Optional[str] = None
    original_subject: Optional[str] = None
    was_edited: bool = False
    edited_at: Optional[datetime] = None


class ScrapeRun(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    source: LeadSource
    query: str
    leads_found: int = 0
    leads_new: int = 0
    status: RunStatus = RunStatus.RUNNING
    error: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None


class ActivityLog(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    event_type: str
    entity_type: Optional[str] = None
    entity_id: Optional[UUID] = None
    details: Optional[dict] = None
    created_at: datetime = Field(default_factory=datetime.now)
