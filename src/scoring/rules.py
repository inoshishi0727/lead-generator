"""Individual scoring rule functions.

Each rule takes a Lead and returns (points, reason) or (0, reason_skipped).
"""

from __future__ import annotations

import re

from src.db.models import Lead, MenuFit, VenueCategory

# Keywords that indicate cocktail/spirits focus
COCKTAIL_KEYWORDS = re.compile(
    r"cocktail|bar|lounge|speakeasy|mixolog|spirits|vermouth|aperitivo|amaro|negroni",
    re.IGNORECASE,
)

# Target London postcodes (central + south)
TARGET_POSTCODES = re.compile(r"\b(SE|SW|EC|WC|E|W|N|NW)\d", re.IGNORECASE)

# Chain venue indicators
CHAIN_INDICATORS = re.compile(
    r"wetherspoon|nando|wagamama|pizza express|prezzo|zizzi|frankie.*benny|harvester",
    re.IGNORECASE,
)


def has_website(lead: Lead) -> tuple[int, str]:
    if lead.website:
        return (1, "Has website")
    return (0, "No website found")


def has_email(lead: Lead) -> tuple[int, str]:
    if lead.email:
        return (1, "Has email address")
    return (0, "No email found")


def has_phone(lead: Lead) -> tuple[int, str]:
    if lead.phone:
        return (1, "Has phone number")
    return (0, "No phone found")


def rating_above_4(lead: Lead) -> tuple[int, str]:
    if lead.rating is not None and lead.rating >= 4.0:
        return (1, f"Rating {lead.rating} >= 4.0")
    if lead.rating is not None:
        return (0, f"Rating {lead.rating} < 4.0")
    return (0, "No rating")


def review_count_above_50(lead: Lead) -> tuple[int, str]:
    if lead.review_count is not None and lead.review_count >= 50:
        return (1, f"{lead.review_count} reviews >= 50")
    if lead.review_count is not None:
        return (0, f"{lead.review_count} reviews < 50")
    return (0, "No review count")


def serves_cocktails(lead: Lead) -> tuple[int, str]:
    searchable = " ".join(
        filter(None, [lead.business_name, lead.category])
    )
    if COCKTAIL_KEYWORDS.search(searchable):
        return (1, f"Cocktail keywords found in '{searchable[:60]}'")
    return (0, "No cocktail keywords detected")


def independent_venue(lead: Lead) -> tuple[int, str]:
    if CHAIN_INDICATORS.search(lead.business_name):
        return (0, "Appears to be a chain venue")
    return (1, "Appears to be independent")


def in_target_area(lead: Lead) -> tuple[int, str]:
    if lead.address and TARGET_POSTCODES.search(lead.address):
        return (1, "In target London area")
    if lead.address:
        return (0, "Outside target area")
    return (0, "No address to check")


def active_instagram(lead: Lead) -> tuple[int, str]:
    if lead.instagram_handle and lead.instagram_followers and lead.instagram_followers >= 500:
        return (1, f"Active IG: @{lead.instagram_handle} ({lead.instagram_followers} followers)")
    if lead.instagram_handle:
        return (0, f"IG present but low followers")
    return (0, "No Instagram")


def social_presence(lead: Lead) -> tuple[int, str]:
    channels = []
    if lead.instagram_handle:
        channels.append("IG")
    if lead.twitter_handle:
        channels.append("Twitter/X")
    if lead.facebook_url:
        channels.append("Facebook")
    if lead.tiktok_handle:
        channels.append("TikTok")
    if lead.youtube_url:
        channels.append("YouTube")
    count = len(channels)
    if count >= 3:
        return (1, f"Strong social presence: {count} channels ({', '.join(channels)})")
    if count >= 1:
        return (0, f"Limited social presence: {count} channel(s) ({', '.join(channels)})")
    return (0, "No social media links found")


def menu_fit_score(lead: Lead) -> tuple[int, str]:
    """Score based on how well the venue's menu aligns with Asterley products."""
    if not lead.enrichment or not lead.enrichment.menu_fit:
        return (0, "No enrichment data")
    fit = lead.enrichment.menu_fit
    if fit in (MenuFit.STRONG, MenuFit.MODERATE):
        signals = ", ".join(lead.enrichment.menu_fit_signals[:3])
        return (1, f"{fit.value.title()} menu fit: {signals}" if signals else f"{fit.value.title()} menu fit")
    return (0, f"{fit.value.title()} menu fit")


# High-value venue categories for scoring
HIGH_VALUE_CATEGORIES = {
    VenueCategory.COCKTAIL_BAR,
    VenueCategory.WINE_BAR,
    VenueCategory.ITALIAN_RESTAURANT,
    VenueCategory.HOTEL_BAR,
    VenueCategory.BOTTLE_SHOP,
    VenueCategory.RESTAURANT_GROUPS,
}


def venue_category_match(lead: Lead) -> tuple[int, str]:
    """Score based on whether the enriched venue category is a high-value target."""
    if not lead.enrichment or not lead.enrichment.venue_category:
        return (0, "No venue category")
    cat = lead.enrichment.venue_category
    if cat in HIGH_VALUE_CATEGORIES:
        return (1, f"High-value category: {cat.value}")
    return (0, f"Standard category: {cat.value}")


# Registry of all rules — order doesn't matter, weights come from config
ALL_RULES: dict[str, callable] = {
    "has_website": has_website,
    "has_email": has_email,
    "has_phone": has_phone,
    "rating_above_4": rating_above_4,
    "review_count_above_50": review_count_above_50,
    "serves_cocktails": serves_cocktails,
    "independent_venue": independent_venue,
    "in_target_area": in_target_area,
    "active_instagram": active_instagram,
    "social_presence": social_presence,
    "menu_fit_score": menu_fit_score,
    "venue_category_match": venue_category_match,
}
