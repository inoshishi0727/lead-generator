"""Tests for the scoring engine and individual rules."""

from src.config.loader import AppConfig, load_config
from src.db.models import Lead, LeadSource, PipelineStage
from src.scoring.engine import ScoringEngine
from src.scoring.rules import (
    has_email,
    has_phone,
    has_website,
    in_target_area,
    independent_venue,
    rating_above_4,
    review_count_above_50,
    serves_cocktails,
)


def _make_lead(**kwargs) -> Lead:
    """Helper to create a lead with defaults."""
    defaults = {
        "source": LeadSource.GOOGLE_MAPS,
        "business_name": "Test Bar",
    }
    defaults.update(kwargs)
    return Lead(**defaults)


# --- Individual Rule Tests ---


class TestHasWebsite:
    def test_with_website(self):
        lead = _make_lead(website="https://example.com")
        points, reason = has_website(lead)
        assert points == 1

    def test_without_website(self):
        lead = _make_lead()
        points, reason = has_website(lead)
        assert points == 0


class TestHasEmail:
    def test_with_email(self):
        lead = _make_lead(email="hello@bar.com")
        points, _ = has_email(lead)
        assert points == 1

    def test_without_email(self):
        lead = _make_lead()
        points, _ = has_email(lead)
        assert points == 0


class TestHasPhone:
    def test_with_phone(self):
        lead = _make_lead(phone="+44 20 1234 5678")
        points, _ = has_phone(lead)
        assert points == 1

    def test_without_phone(self):
        lead = _make_lead()
        points, _ = has_phone(lead)
        assert points == 0


class TestRatingAbove4:
    def test_high_rating(self):
        lead = _make_lead(rating=4.5)
        points, _ = rating_above_4(lead)
        assert points == 1

    def test_low_rating(self):
        lead = _make_lead(rating=3.5)
        points, _ = rating_above_4(lead)
        assert points == 0

    def test_no_rating(self):
        lead = _make_lead()
        points, _ = rating_above_4(lead)
        assert points == 0

    def test_exact_4(self):
        lead = _make_lead(rating=4.0)
        points, _ = rating_above_4(lead)
        assert points == 1


class TestReviewCount:
    def test_above_50(self):
        lead = _make_lead(review_count=120)
        points, _ = review_count_above_50(lead)
        assert points == 1

    def test_below_50(self):
        lead = _make_lead(review_count=30)
        points, _ = review_count_above_50(lead)
        assert points == 0


class TestServesCocktails:
    def test_cocktail_bar(self):
        lead = _make_lead(business_name="The Cocktail Trading Co", category="Bar")
        points, _ = serves_cocktails(lead)
        assert points == 1

    def test_restaurant_no_cocktails(self):
        lead = _make_lead(business_name="Pizza Palace", category="Restaurant")
        points, _ = serves_cocktails(lead)
        assert points == 0

    def test_vermouth_keyword(self):
        lead = _make_lead(business_name="Vermouth & Co")
        points, _ = serves_cocktails(lead)
        assert points == 1


class TestIndependentVenue:
    def test_independent(self):
        lead = _make_lead(business_name="The Artisan Bar")
        points, _ = independent_venue(lead)
        assert points == 1

    def test_chain(self):
        lead = _make_lead(business_name="Wetherspoon The Moon Under Water")
        points, _ = independent_venue(lead)
        assert points == 0


class TestInTargetArea:
    def test_in_area(self):
        lead = _make_lead(address="123 High St, SE1 7AB")
        points, _ = in_target_area(lead)
        assert points == 1

    def test_no_address(self):
        lead = _make_lead()
        points, _ = in_target_area(lead)
        assert points == 0


# --- Scoring Engine Tests ---


class TestScoringEngine:
    def test_score_perfect_lead(self):
        engine = ScoringEngine()
        lead = _make_lead(
            business_name="The Cocktail Club",
            website="https://cocktailclub.com",
            email="hello@cocktailclub.com",
            phone="+44 20 1234 5678",
            rating=4.7,
            review_count=250,
            category="Cocktail Bar",
            address="10 Southwark St, SE1 1TJ",
            instagram_handle="cocktailclub",
            instagram_followers=5000,
        )
        score, breakdown = engine.score_lead(lead)
        # Without enrichment data, max from base rules is 73
        assert score > 50
        assert "has_website" in breakdown
        assert "serves_cocktails" in breakdown

    def test_score_minimal_lead(self):
        engine = ScoringEngine()
        lead = _make_lead(business_name="Test Place")
        score, breakdown = engine.score_lead(lead)
        # Only independent_venue should score (no chain indicators, no keywords)
        assert score == 10  # independent_venue weight (rebalanced)
        assert breakdown["independent_venue"].points == 10

    def test_score_leads_batch(self):
        engine = ScoringEngine()
        leads = [
            _make_lead(business_name="Bar A", website="https://a.com"),
            _make_lead(business_name="Bar B"),
        ]
        scored = engine.score_leads(leads)
        assert all(lead.score is not None for lead in scored)

    def test_passes_threshold(self):
        engine = ScoringEngine()
        lead = _make_lead(score=50)
        assert engine.passes_threshold(lead) is True

    def test_below_threshold(self):
        engine = ScoringEngine()
        lead = _make_lead(score=20)
        assert engine.passes_threshold(lead) is False

    def test_custom_weights(self):
        engine = ScoringEngine()
        lead = _make_lead(website="https://example.com")
        score, _ = engine.score_lead(lead, weights_override={"has_website": 50, "independent_venue": 0})
        assert score == 50
