"""Tests for lead enrichment: analyzer, scoring rules, and product mapping."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.config.loader import EnrichmentConfig
from src.db.models import (
    ContactInfo,
    EnrichmentData,
    Lead,
    LeadSource,
    MenuFit,
    PipelineStage,
    ToneTier,
    VenueCategory,
)
from src.enrichment.analyzer import (
    CATEGORY_PRODUCTS,
    _parse_gemini_response,
    _safe_enum,
    analyze_website,
)
from src.scoring.rules import menu_fit_score, venue_category_match


def _make_lead(**kwargs) -> Lead:
    defaults = {
        "source": LeadSource.GOOGLE_MAPS,
        "business_name": "Test Bar",
    }
    defaults.update(kwargs)
    return Lead(**defaults)


# --- JSON Parsing Tests ---


class TestParseGeminiResponse:
    def test_valid_json(self):
        raw = '{"venue_category": "cocktail_bar", "menu_fit": "strong"}'
        result = _parse_gemini_response(raw)
        assert result["venue_category"] == "cocktail_bar"

    def test_markdown_fenced_json(self):
        raw = '```json\n{"venue_category": "wine_bar"}\n```'
        result = _parse_gemini_response(raw)
        assert result["venue_category"] == "wine_bar"

    def test_json_with_surrounding_text(self):
        raw = 'Here is the result: {"venue_category": "gastropub"} end'
        result = _parse_gemini_response(raw)
        assert result["venue_category"] == "gastropub"

    def test_invalid_json(self):
        raw = "This is not JSON at all"
        result = _parse_gemini_response(raw)
        assert result is None

    def test_empty_string(self):
        result = _parse_gemini_response("")
        assert result is None


class TestSafeEnum:
    def test_valid_value(self):
        assert _safe_enum(VenueCategory, "cocktail_bar") == VenueCategory.COCKTAIL_BAR

    def test_invalid_value(self):
        assert _safe_enum(VenueCategory, "nonexistent") is None

    def test_none_value(self):
        assert _safe_enum(VenueCategory, None) is None

    def test_with_default(self):
        assert _safe_enum(MenuFit, "bad", MenuFit.UNKNOWN) == MenuFit.UNKNOWN


# --- Product Mapping Tests ---


class TestProductMapping:
    def test_all_categories_have_products(self):
        for cat in VenueCategory:
            assert cat in CATEGORY_PRODUCTS, f"Missing product mapping for {cat.value}"
            assert len(CATEGORY_PRODUCTS[cat]) > 0

    def test_cocktail_bar_products(self):
        products = CATEGORY_PRODUCTS[VenueCategory.COCKTAIL_BAR]
        assert "DISPENSE" in products
        assert "SCHOFIELD'S" in products

    def test_wine_bar_products(self):
        products = CATEGORY_PRODUCTS[VenueCategory.WINE_BAR]
        assert "ESTATE" in products
        assert "ROSÉ" in products

    def test_gastropub_products(self):
        products = CATEGORY_PRODUCTS[VenueCategory.GASTROPUB]
        assert "DISPENSE" in products
        assert "ASTERLEY ORIGINAL" in products


# --- Gemini Analysis Tests ---


class TestAnalyzeWebsite:
    @pytest.mark.asyncio
    async def test_empty_text_returns_failed(self):
        lead = _make_lead()
        config = EnrichmentConfig()
        result = await analyze_website("", lead, config)
        assert result.enrichment_status == "failed"
        assert "No website text" in result.enrichment_error

    @pytest.mark.asyncio
    async def test_successful_analysis(self):
        gemini_response = json.dumps({
            "venue_category": "cocktail_bar",
            "menu_fit": "strong",
            "menu_fit_signals": ["Negroni on menu", "craft spirits list"],
            "context_notes": "Award-winning cocktail bar with a focus on classic serves.",
            "tone_tier": "bartender_casual",
            "contact_name": "Tom Smith",
            "contact_role": "Bar Manager",
            "contact_confidence": "verified",
        })

        mock_response = MagicMock()
        mock_response.text = gemini_response

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        lead = _make_lead(business_name="Satan's Whiskers", category="Bar")
        config = EnrichmentConfig()

        with patch("src.enrichment.analyzer.genai.Client", return_value=mock_client):
            result = await analyze_website("Website text here...", lead, config)

        assert result.enrichment_status == "success"
        assert result.venue_category == VenueCategory.COCKTAIL_BAR
        assert result.menu_fit == MenuFit.STRONG
        assert len(result.menu_fit_signals) == 2
        assert result.tone_tier == ToneTier.BARTENDER_CASUAL
        assert result.contact.name == "Tom Smith"
        assert result.contact.role == "Bar Manager"
        assert result.contact.confidence == "verified"
        # Product mapping is deterministic
        assert "DISPENSE" in result.lead_products
        assert "SCHOFIELD'S" in result.lead_products
        assert result.enrichment_source == "website"

    @pytest.mark.asyncio
    async def test_gemini_api_error(self):
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("API rate limit")

        lead = _make_lead()
        config = EnrichmentConfig()

        with patch("src.enrichment.analyzer.genai.Client", return_value=mock_client):
            result = await analyze_website("Some text", lead, config)

        assert result.enrichment_status == "failed"
        assert "Gemini API error" in result.enrichment_error

    @pytest.mark.asyncio
    async def test_invalid_gemini_json(self):
        mock_response = MagicMock()
        mock_response.text = "Sorry, I can't analyze this website."

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        lead = _make_lead()
        config = EnrichmentConfig()

        with patch("src.enrichment.analyzer.genai.Client", return_value=mock_client):
            result = await analyze_website("Some text", lead, config)

        assert result.enrichment_status == "failed"

    @pytest.mark.asyncio
    async def test_no_contact_found(self):
        gemini_response = json.dumps({
            "venue_category": "gastropub",
            "menu_fit": "moderate",
            "menu_fit_signals": ["beer garden with cocktails"],
            "context_notes": "Cozy gastropub in Peckham.",
            "tone_tier": "bartender_casual",
            "contact_name": None,
            "contact_role": None,
            "contact_confidence": None,
        })

        mock_response = MagicMock()
        mock_response.text = gemini_response

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        lead = _make_lead()
        config = EnrichmentConfig()

        with patch("src.enrichment.analyzer.genai.Client", return_value=mock_client):
            result = await analyze_website("Pub website text", lead, config)

        assert result.enrichment_status == "success"
        assert result.contact is None


# --- Enrichment Scoring Rules Tests ---


class TestMenuFitScore:
    def test_strong_fit(self):
        lead = _make_lead(
            enrichment=EnrichmentData(
                menu_fit=MenuFit.STRONG,
                menu_fit_signals=["Negroni on menu", "vermouth listed"],
                enrichment_status="success",
            )
        )
        points, reason = menu_fit_score(lead)
        assert points == 1
        assert "Strong" in reason

    def test_moderate_fit(self):
        lead = _make_lead(
            enrichment=EnrichmentData(
                menu_fit=MenuFit.MODERATE,
                menu_fit_signals=["cocktail menu available"],
                enrichment_status="success",
            )
        )
        points, _ = menu_fit_score(lead)
        assert points == 1

    def test_weak_fit(self):
        lead = _make_lead(
            enrichment=EnrichmentData(
                menu_fit=MenuFit.WEAK,
                enrichment_status="success",
            )
        )
        points, _ = menu_fit_score(lead)
        assert points == 0

    def test_no_enrichment(self):
        lead = _make_lead()
        points, _ = menu_fit_score(lead)
        assert points == 0


class TestVenueCategoryMatch:
    def test_high_value_cocktail_bar(self):
        lead = _make_lead(
            enrichment=EnrichmentData(
                venue_category=VenueCategory.COCKTAIL_BAR,
                enrichment_status="success",
            )
        )
        points, reason = venue_category_match(lead)
        assert points == 1
        assert "High-value" in reason

    def test_high_value_wine_bar(self):
        lead = _make_lead(
            enrichment=EnrichmentData(
                venue_category=VenueCategory.WINE_BAR,
                enrichment_status="success",
            )
        )
        points, _ = venue_category_match(lead)
        assert points == 1

    def test_standard_category(self):
        lead = _make_lead(
            enrichment=EnrichmentData(
                venue_category=VenueCategory.GROCERY,
                enrichment_status="success",
            )
        )
        points, reason = venue_category_match(lead)
        assert points == 0
        assert "Standard" in reason

    def test_no_enrichment(self):
        lead = _make_lead()
        points, _ = venue_category_match(lead)
        assert points == 0


# --- EnrichmentData Model Tests ---


class TestEnrichmentDataModel:
    def test_default_status(self):
        data = EnrichmentData()
        assert data.enrichment_status == "pending"

    def test_full_enrichment(self):
        data = EnrichmentData(
            venue_category=VenueCategory.COCKTAIL_BAR,
            menu_fit=MenuFit.STRONG,
            menu_fit_signals=["Negroni", "Spritz section"],
            context_notes="Top 50 bar with seasonal rotating menu.",
            lead_products=["DISPENSE", "SCHOFIELD'S"],
            tone_tier=ToneTier.BARTENDER_CASUAL,
            contact=ContactInfo(
                name="Rob", role="Owner", confidence="verified"
            ),
            enrichment_source="website",
            enrichment_status="success",
        )
        assert data.venue_category == VenueCategory.COCKTAIL_BAR
        assert len(data.lead_products) == 2
        assert data.contact.name == "Rob"

    def test_serialization(self):
        data = EnrichmentData(
            venue_category=VenueCategory.WINE_BAR,
            menu_fit=MenuFit.MODERATE,
            enrichment_status="success",
        )
        dumped = data.model_dump(mode="json")
        assert dumped["venue_category"] == "wine_bar"
        assert dumped["menu_fit"] == "moderate"

    def test_lead_with_enrichment(self):
        lead = _make_lead(
            enrichment=EnrichmentData(
                venue_category=VenueCategory.HOTEL_BAR,
                enrichment_status="success",
            )
        )
        assert lead.enrichment.venue_category == VenueCategory.HOTEL_BAR
        dumped = lead.model_dump(mode="json")
        assert dumped["enrichment"]["venue_category"] == "hotel_bar"
