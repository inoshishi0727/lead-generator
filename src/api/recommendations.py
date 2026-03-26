"""AI Recommendations API router."""

from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, HTTPException

from src.api.schemas import LeadRecommendation, StrategyResponse
from src.config.loader import LeadRatiosConfig, load_config

log = structlog.get_logger()

recommendations_router = APIRouter(prefix="/api/recommendations")


@recommendations_router.get("/strategy", response_model=StrategyResponse)
async def get_strategy() -> StrategyResponse:
    from src.db.firestore import get_config as get_fs_config
    from src.db.firestore import get_leads
    from src.recommendations.engine import RecommendationEngine

    config = load_config()
    fs_ratios = get_fs_config("lead_ratios")
    ratios = config.lead_ratios
    if fs_ratios:
        ratios = LeadRatiosConfig(**fs_ratios)

    docs = get_leads()
    if not docs:
        return StrategyResponse(
            insights=[{
                "title": "No leads yet",
                "description": "Start scraping to generate leads, then come back for AI recommendations.",
                "action": "Go to the Dashboard and start a scrape.",
                "priority": "high",
                "category": None,
            }],
        )

    engine = RecommendationEngine(config=config)
    result = await engine.generate_strategy(docs, ratios)

    return StrategyResponse(**result)


@recommendations_router.get("/lead/{lead_id}", response_model=LeadRecommendation)
async def get_lead_recommendation(lead_id: str) -> LeadRecommendation:
    from src.db.firestore import get_lead_by_id
    from src.recommendations.engine import RecommendationEngine

    doc = get_lead_by_id(lead_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Lead not found")

    config = load_config()
    engine = RecommendationEngine(config=config)
    result = await engine.recommend_for_lead(doc)

    return LeadRecommendation(**result)


@recommendations_router.get("/outreach-plan")
async def get_outreach_plan(limit: int = 15):
    """Smart outreach plan — who to contact this week, prioritized by season, fit, and timing."""
    from src.db.firestore import get_leads
    from src.recommendations.outreach_planner import plan_outreach

    docs = get_leads()
    if not docs:
        return {"season": "unknown", "recommended": [], "total_eligible": 0}

    return plan_outreach(docs, limit=limit)
