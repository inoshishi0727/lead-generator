"""YAML config loader with Pydantic validation."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel


class GoogleMapsConfig(BaseModel):
    target_count: int = 60
    search_queries: list[str] = []
    scroll_pause_seconds: int = 2
    max_stale_rounds: int = 3
    locale: str = "en"
    headless: bool = True
    pagination_batch_size: int = 10
    max_pagination_rounds: int = 3
    max_parallel_browsers: int = 3


class GoogleSearchConfig(BaseModel):
    search_queries: list[str] = []
    results_per_query: int = 20
    max_parallel_browsers: int = 2
    headless: bool = True
    skip_domains: list[str] = [
        "youtube.com",
        "wikipedia.org",
        "reddit.com",
        "tripadvisor.com",
        "yelp.com",
        "facebook.com",
        "instagram.com",
        "twitter.com",
        "linkedin.com",
        "pinterest.com",
        "tiktok.com",
        "amazon.co.uk",
        "amazon.com",
        "ebay.co.uk",
    ]


class BingSearchConfig(BaseModel):
    search_queries: list[str] = []
    results_per_query: int = 20
    max_parallel_browsers: int = 2
    headless: bool = True
    skip_domains: list[str] = [
        "youtube.com",
        "wikipedia.org",
        "reddit.com",
        "tripadvisor.com",
        "yelp.com",
        "facebook.com",
        "instagram.com",
        "twitter.com",
        "linkedin.com",
        "pinterest.com",
        "tiktok.com",
        "amazon.co.uk",
        "amazon.com",
        "ebay.co.uk",
    ]


class DirectoryConfig(BaseModel):
    category_urls: list[str] = []
    max_results_per_category: int = 50
    max_parallel_browsers: int = 2
    headless: bool = True


class IndustrySiteEntry(BaseModel):
    name: str
    base_url: str
    listing_paths: list[str] = []
    max_results: int = 30


class IndustrySiteConfig(BaseModel):
    sites: list[IndustrySiteEntry] = []
    max_parallel_browsers: int = 1
    headless: bool = True


class InstagramConfig(BaseModel):
    target_count: int = 40
    hashtags: list[str] = []
    max_profiles_per_hashtag: int = 20
    headless: bool = True
    max_parallel_browsers: int = 2


class EmailExtractionConfig(BaseModel):
    gemini_enabled: bool = True
    gemini_max_text_chars: int = 8000


class EnrichmentConfig(BaseModel):
    enabled: bool = True
    camoufox_timeout_seconds: int = 20
    pages_to_visit: list[str] = ["/", "/menu", "/about", "/contact"]
    gemini_model: str = "gemini-2.5-flash"
    gemini_max_input_chars: int = 40000
    gemini_max_tokens: int = 2000
    gemini_temperature: float = 0.2
    max_concurrent: int = 3
    headless: bool = True


class ScrapingConfig(BaseModel):
    google_maps: GoogleMapsConfig = GoogleMapsConfig()
    google_search: GoogleSearchConfig = GoogleSearchConfig()
    bing_search: BingSearchConfig = BingSearchConfig()
    directory: DirectoryConfig = DirectoryConfig()
    industry_sites: IndustrySiteConfig = IndustrySiteConfig()
    instagram: InstagramConfig = InstagramConfig()
    email_extraction: EmailExtractionConfig = EmailExtractionConfig()
    enrichment: EnrichmentConfig = EnrichmentConfig()


class ScoringWeights(BaseModel):
    has_website: int = 5
    has_email: int = 12
    has_phone: int = 3
    rating_above_4: int = 8
    review_count_above_50: int = 7
    serves_cocktails: int = 15
    independent_venue: int = 10
    in_target_area: int = 8
    active_instagram: int = 5
    menu_fit_score: int = 15
    venue_category_match: int = 12


class ScoringConfig(BaseModel):
    weights: ScoringWeights = ScoringWeights()
    min_score_threshold: int = 40


class GeminiConfig(BaseModel):
    model: str = "gemini-2.5-flash"
    max_tokens: int = 500
    temperature: float = 0.7


class EmailConfig(BaseModel):
    daily_limit: int = 50
    batch_size: int = 10
    delay_between_seconds: int = 30


class DmConfig(BaseModel):
    daily_limit: int = 20
    delay_between_seconds: int = 60


class OutreachConfig(BaseModel):
    gemini: GeminiConfig = GeminiConfig()
    email: EmailConfig = EmailConfig()
    dm: DmConfig = DmConfig()


class PipelineConfig(BaseModel):
    stages: list[str] = []
    follow_up_days: dict[str, int] = {"first": 5, "second": 12}


class RateLimitsConfig(BaseModel):
    google_maps_rpm: int = 10
    google_search_rpm: int = 8
    bing_search_rpm: int = 12
    directory_rpm: int = 10
    industry_sites_rpm: int = 8
    instagram_rpm: int = 5
    gemini_rpm: int = 30
    resend_rpm: int = 10
    enrichment_rpm: int = 20


class LeadRatiosConfig(BaseModel):
    cocktail_bar: float = 0.20
    wine_bar: float = 0.15
    hotel_bar: float = 0.10
    italian_restaurant: float = 0.10
    gastropub: float = 0.10
    bottle_shop: float = 0.10
    restaurant_groups: float = 0.05
    other: float = 0.20


class ExclusionConfig(BaseModel):
    stockist_csv: str = "Stockist Spreadsheet 1.csv"


class ProjectConfig(BaseModel):
    name: str = "Asterley Bros Lead Generation"
    version: str = "0.1.0"


class AppConfig(BaseModel):
    project: ProjectConfig = ProjectConfig()
    exclusion: ExclusionConfig = ExclusionConfig()
    scraping: ScrapingConfig = ScrapingConfig()
    scoring: ScoringConfig = ScoringConfig()
    outreach: OutreachConfig = OutreachConfig()
    pipeline: PipelineConfig = PipelineConfig()
    rate_limits: RateLimitsConfig = RateLimitsConfig()
    lead_ratios: LeadRatiosConfig = LeadRatiosConfig()


@lru_cache(maxsize=1)
def load_config(config_path: str | Path | None = None) -> AppConfig:
    """Load and validate the application config from YAML."""
    if config_path is None:
        config_path = Path(__file__).parent.parent.parent / "config.yaml"
    else:
        config_path = Path(config_path)

    with open(config_path) as f:
        raw = yaml.safe_load(f)

    return AppConfig.model_validate(raw or {})


def load_search_queries() -> dict[str, list[str]]:
    """Load search queries with Firestore overrides, falling back to YAML.

    Returns dict keyed by source: google_maps, google_search, bing_search, directory.
    """
    from src.db.firestore import get_config as get_fs_config

    fs_queries = get_fs_config("search_queries")
    if fs_queries:
        return fs_queries

    config = load_config()
    return {
        "google_maps": config.scraping.google_maps.search_queries,
        "google_search": config.scraping.google_search.search_queries,
        "bing_search": config.scraping.bing_search.search_queries,
        "directory": config.scraping.directory.category_urls,
    }
