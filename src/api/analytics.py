"""Analytics API router — funnel, categories, ratios, trends."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter

from src.api.schemas import (
    CategoryStat,
    CategoryStatsResponse,
    FunnelResponse,
    FunnelStage,
    RatioComparison,
    RatioComparisonResponse,
    TrendPoint,
    TrendsResponse,
)
from src.config.loader import LeadRatiosConfig, load_config
from src.pipeline.tracker import PipelineTracker

log = structlog.get_logger()

analytics_router = APIRouter(prefix="/api/analytics")

STAGE_ORDER = [
    "scraped", "needs_email", "enriched", "scored",
    "draft_generated", "approved", "sent",
    "follow_up_1", "follow_up_2", "responded", "converted", "declined",
]


def _get_all_lead_docs() -> list[dict]:
    from src.db.firestore import get_leads
    return get_leads()


@analytics_router.get("/funnel", response_model=FunnelResponse)
async def get_funnel() -> FunnelResponse:
    docs = _get_all_lead_docs()
    if not docs:
        return FunnelResponse(stages=[], total_leads=0)

    # Count leads per stage
    stage_counts: dict[str, int] = defaultdict(int)
    for doc in docs:
        stage = doc.get("stage", "scraped")
        stage_counts[stage] += 1

    total = len(docs)
    stages = []
    for stage_name in STAGE_ORDER:
        count = stage_counts.get(stage_name, 0)
        rate = (count / total * 100) if total > 0 else 0.0
        stages.append(FunnelStage(name=stage_name, count=count, conversion_rate=round(rate, 1)))

    return FunnelResponse(stages=stages, total_leads=total)


@analytics_router.get("/categories", response_model=CategoryStatsResponse)
async def get_categories() -> CategoryStatsResponse:
    docs = _get_all_lead_docs()
    if not docs:
        return CategoryStatsResponse(categories=[])

    # Group docs by venue category
    by_category: dict[str, list[dict]] = defaultdict(list)
    for doc in docs:
        enrichment = doc.get("enrichment") or {}
        cat = enrichment.get("venue_category", "other") or "other"
        by_category[cat].append(doc)

    categories = []
    for cat, cat_docs in sorted(by_category.items(), key=lambda x: -len(x[1])):
        count = len(cat_docs)
        scores = [d.get("score", 0) for d in cat_docs if d.get("score") is not None]
        avg_score = sum(scores) / len(scores) if scores else 0.0

        responded = sum(1 for d in cat_docs if d.get("stage") in ("responded", "converted"))
        sent = sum(1 for d in cat_docs if d.get("stage") in ("sent", "follow_up_1", "follow_up_2", "responded", "converted", "declined"))
        converted = sum(1 for d in cat_docs if d.get("stage") == "converted")

        response_rate = (responded / sent * 100) if sent > 0 else 0.0
        conversion_rate = (converted / count * 100) if count > 0 else 0.0

        categories.append(CategoryStat(
            category=cat,
            count=count,
            avg_score=round(avg_score, 1),
            response_rate=round(response_rate, 1),
            conversion_rate=round(conversion_rate, 1),
        ))

    return CategoryStatsResponse(categories=categories)


@analytics_router.get("/ratios", response_model=RatioComparisonResponse)
async def get_ratio_comparison() -> RatioComparisonResponse:
    docs = _get_all_lead_docs()
    config = load_config()

    # Check Firestore overrides
    from src.db.firestore import get_config as get_fs_config
    fs_ratios = get_fs_config("lead_ratios")
    ratios = config.lead_ratios
    if fs_ratios:
        ratios = LeadRatiosConfig(**fs_ratios)

    category_counts = PipelineTracker.get_category_counts_from_docs(docs)
    actual = PipelineTracker.get_category_distribution(category_counts)
    target = ratios.model_dump()

    comparisons = []
    for cat, target_pct in target.items():
        actual_pct = actual.get(cat, 0.0)
        comparisons.append(RatioComparison(
            category=cat,
            target=round(target_pct, 4),
            actual=round(actual_pct, 4),
            delta=round(target_pct - actual_pct, 4),
        ))

    comparisons.sort(key=lambda r: abs(r.delta), reverse=True)
    return RatioComparisonResponse(ratios=comparisons)


@analytics_router.get("/trends", response_model=TrendsResponse)
async def get_trends(period: str = "week", lookback: int = 12) -> TrendsResponse:
    docs = _get_all_lead_docs()
    if not docs:
        return TrendsResponse(series=[])

    now = datetime.now()
    delta = timedelta(weeks=1) if period == "week" else timedelta(days=30)

    # Build period buckets
    buckets: dict[str, dict[str, int]] = {}
    for i in range(lookback):
        bucket_start = now - delta * (lookback - i)
        bucket_key = bucket_start.strftime("%Y-%m-%d")
        buckets[bucket_key] = {"scraped": 0, "enriched": 0, "scored": 0, "sent": 0, "converted": 0}

    # Assign docs to buckets based on scraped_at
    bucket_keys = sorted(buckets.keys())
    for doc in docs:
        scraped_at = doc.get("scraped_at")
        if not scraped_at:
            continue

        if isinstance(scraped_at, str):
            try:
                scraped_dt = datetime.fromisoformat(scraped_at.replace("Z", "+00:00"))
            except ValueError:
                continue
        elif isinstance(scraped_at, datetime):
            scraped_dt = scraped_at
        else:
            continue

        # Find the right bucket
        assigned = None
        for bk in bucket_keys:
            bk_dt = datetime.fromisoformat(bk)
            if scraped_dt.replace(tzinfo=None) >= bk_dt:
                assigned = bk

        if assigned and assigned in buckets:
            stage = doc.get("stage", "scraped")
            buckets[assigned]["scraped"] += 1
            if stage in ("enriched", "scored", "draft_generated", "approved", "sent", "follow_up_1", "follow_up_2", "responded", "converted"):
                buckets[assigned]["enriched"] += 1
            if stage in ("scored", "draft_generated", "approved", "sent", "follow_up_1", "follow_up_2", "responded", "converted"):
                buckets[assigned]["scored"] += 1
            if stage in ("sent", "follow_up_1", "follow_up_2", "responded", "converted"):
                buckets[assigned]["sent"] += 1
            if stage == "converted":
                buckets[assigned]["converted"] += 1

    series = [
        TrendPoint(period=bk, **counts)
        for bk, counts in sorted(buckets.items())
    ]
    return TrendsResponse(series=series)
