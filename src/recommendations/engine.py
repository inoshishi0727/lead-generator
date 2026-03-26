"""Gemini-powered recommendation engine for strategy and per-lead insights."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime

import structlog
from google import genai

from src.config.loader import AppConfig, LeadRatiosConfig, load_config
from src.enrichment.analyzer import CATEGORY_PRODUCTS, _parse_gemini_response

log = structlog.get_logger()

STRATEGY_PROMPT = """You are a sales strategy advisor for Asterley Bros, an English Vermouth, Amaro, and Aperitivo producer in SE London.

Analyze these lead generation statistics and provide actionable recommendations.

Current lead distribution by venue category:
{category_stats}

Target ratios:
{target_ratios}

Overall metrics:
- Total leads: {total_leads}
- Average score: {avg_score}
- Response rate: {response_rate}%
- Conversion rate: {conversion_rate}%

Return a JSON object with:
{{
  "insights": [
    {{
      "title": "short headline",
      "description": "1-2 sentence explanation with specific numbers",
      "action": "specific action to take",
      "priority": "high" or "medium" or "low",
      "category": "venue_category or null if general"
    }}
  ],
  "ratio_adjustments": [
    {{
      "category": "venue_category",
      "current_ratio": 0.10,
      "recommended_ratio": 0.20,
      "reason": "why this change"
    }}
  ],
  "query_suggestions": ["new Google Maps search query 1", "query 2"]
}}

Provide 3-5 insights, 2-3 ratio adjustments, and 2-3 query suggestions.
Focus on what will improve response and conversion rates.
Return ONLY valid JSON."""

LEAD_PROMPT = """You are an outreach advisor for Asterley Bros (English Vermouth, Amaro, Aperitivo, SE London).

Given this venue's enrichment data, recommend the best outreach approach.

Venue: {business_name}
Category: {venue_category}
Menu fit: {menu_fit}
Context: {context_notes}
Tone tier: {tone_tier}
Has email: {has_email}
Has Instagram: {has_instagram}
Current season: Spring

Asterley Bros products: SCHOFIELD'S (Dry Vermouth), ESTATE (Sweet Vermouth), ROSÉ (Rosé Vermouth), RED (Value Sweet Vermouth), ASTERLEY ORIGINAL (Aperitivo), DISPENSE (Amaro), BRITANNICA (Fernet).

Return a JSON object with:
{{
  "lead_product": "which product to lead with (e.g. DISPENSE, SCHOFIELD'S)",
  "outreach_channel": "email" or "instagram_dm",
  "tone_tier": "bartender_casual" or "warm_professional" or "b2b_commercial" or "corporate_formal",
  "timing_note": "when to reach out (e.g. Tuesday morning, before lunch rush)",
  "opening_hook": "a specific personalized first sentence idea for the outreach",
  "confidence": 0.0 to 1.0
}}

Return ONLY valid JSON."""


class RecommendationEngine:
    """Generates AI-powered recommendations using Gemini."""

    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or load_config()
        self._client = genai.Client()

    async def generate_strategy(
        self,
        lead_docs: list[dict],
        ratios: LeadRatiosConfig,
    ) -> dict:
        """Generate category-level strategy recommendations."""
        # Aggregate stats
        by_cat: dict[str, list[dict]] = defaultdict(list)
        for doc in lead_docs:
            enrichment = doc.get("enrichment") or {}
            cat = enrichment.get("venue_category", "other") or "other"
            by_cat[cat].append(doc)

        total = len(lead_docs)
        all_scores = [d.get("score", 0) for d in lead_docs if d.get("score") is not None]
        avg_score = sum(all_scores) / len(all_scores) if all_scores else 0

        sent = sum(1 for d in lead_docs if d.get("stage") in ("sent", "follow_up_1", "follow_up_2", "responded", "converted", "declined"))
        responded = sum(1 for d in lead_docs if d.get("stage") in ("responded", "converted"))
        converted = sum(1 for d in lead_docs if d.get("stage") == "converted")

        response_rate = (responded / sent * 100) if sent > 0 else 0
        conversion_rate = (converted / total * 100) if total > 0 else 0

        category_stats = []
        for cat, docs in sorted(by_cat.items(), key=lambda x: -len(x[1])):
            cat_sent = sum(1 for d in docs if d.get("stage") in ("sent", "follow_up_1", "follow_up_2", "responded", "converted", "declined"))
            cat_responded = sum(1 for d in docs if d.get("stage") in ("responded", "converted"))
            cat_converted = sum(1 for d in docs if d.get("stage") == "converted")
            category_stats.append(
                f"- {cat}: {len(docs)} leads, "
                f"{cat_sent} sent, {cat_responded} responded, {cat_converted} converted"
            )

        prompt = STRATEGY_PROMPT.format(
            category_stats="\n".join(category_stats),
            target_ratios=json.dumps(ratios.model_dump(), indent=2),
            total_leads=total,
            avg_score=round(avg_score, 1),
            response_rate=round(response_rate, 1),
            conversion_rate=round(conversion_rate, 1),
        )

        try:
            response = self._client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config={"max_output_tokens": 1500, "temperature": 0.3},
            )
            parsed = _parse_gemini_response(response.text)
            if parsed:
                parsed["generated_at"] = datetime.now().isoformat()
                return parsed
        except Exception as e:
            log.error("strategy_generation_failed", error=str(e))

        # Fallback: basic heuristic recommendations
        return {
            "insights": [{
                "title": "Insufficient data for AI analysis",
                "description": f"Currently have {total} leads. Need more conversion data for meaningful recommendations.",
                "action": "Continue scraping and sending outreach to build up conversion statistics.",
                "priority": "medium",
                "category": None,
            }],
            "ratio_adjustments": [],
            "query_suggestions": [],
            "generated_at": datetime.now().isoformat(),
        }

    async def recommend_for_lead(self, lead_doc: dict) -> dict:
        """Generate per-lead outreach recommendation."""
        enrichment = lead_doc.get("enrichment") or {}
        venue_category = enrichment.get("venue_category", "other")

        prompt = LEAD_PROMPT.format(
            business_name=lead_doc.get("business_name", "Unknown"),
            venue_category=venue_category,
            menu_fit=enrichment.get("menu_fit", "unknown"),
            context_notes=enrichment.get("context_notes", "No context available"),
            tone_tier=enrichment.get("tone_tier", "warm_professional"),
            has_email=bool(lead_doc.get("email")),
            has_instagram=bool(lead_doc.get("instagram_handle")),
        )

        try:
            response = self._client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config={"max_output_tokens": 500, "temperature": 0.3},
            )
            parsed = _parse_gemini_response(response.text)
            if parsed:
                parsed["lead_id"] = lead_doc.get("id", "")
                return parsed
        except Exception as e:
            log.error("lead_recommendation_failed", lead=lead_doc.get("business_name"), error=str(e))

        # Deterministic fallback
        from src.db.models import VenueCategory
        try:
            vc = VenueCategory(venue_category)
            products = CATEGORY_PRODUCTS.get(vc, ["DISPENSE"])
        except ValueError:
            products = ["DISPENSE"]

        channel = "email" if lead_doc.get("email") else "instagram_dm"
        return {
            "lead_id": lead_doc.get("id", ""),
            "lead_product": products[0] if products else "DISPENSE",
            "outreach_channel": channel,
            "tone_tier": enrichment.get("tone_tier", "warm_professional"),
            "timing_note": "Tuesday or Wednesday morning, 10am-12pm",
            "opening_hook": f"Reaching out to {lead_doc.get('business_name', 'your venue')} about our craft spirits range.",
            "confidence": 0.4,
        }
