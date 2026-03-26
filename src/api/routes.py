"""FastAPI routes — scraping, enrichment, scoring, ratios."""

from __future__ import annotations

import asyncio
import csv
import io
import os
import threading
from datetime import datetime
from uuid import uuid4

import structlog
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from src.api.schemas import (
    ConfigResponse,
    EnrichRequest,
    EnrichStatusResponse,
    LeadResponse,
    RatioUpdateRequest,
    ScoreStatusResponse,
    ScrapeRequest,
    ScrapeStatusResponse,
)
from src.config.loader import load_config
from src.scrapers.orchestrator import ParallelScrapeOrchestrator

log = structlog.get_logger()

router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# In-memory state (fallback when Firestore is unavailable)
# ---------------------------------------------------------------------------
_scrape_runs: dict[str, dict] = {}
_scrape_leads: dict[str, list[LeadResponse]] = {}  # run_id -> leads
_enrich_runs: dict[str, dict] = {}  # run_id -> enrichment status


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ENV_VARS_TO_CHECK = [
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GEMINI_API_KEY",
    "RESEND_API_KEY",
    "PROXY_HOST",
]


def _lead_to_response(lead) -> LeadResponse:
    """Convert a Lead model or Firestore dict to a LeadResponse."""
    if isinstance(lead, dict):
        enrichment = lead.get("enrichment") or {}
        contact = enrichment.get("contact") or {}
        return LeadResponse(
            id=lead.get("id", ""),
            business_name=lead.get("business_name", ""),
            address=lead.get("address"),
            phone=lead.get("phone"),
            website=lead.get("website"),
            email=lead.get("email"),
            email_found=lead.get("email_found", False),
            source=lead.get("source"),
            stage=lead.get("stage"),
            rating=lead.get("rating"),
            review_count=lead.get("review_count"),
            category=lead.get("category"),
            scraped_at=lead.get("scraped_at"),
            score=lead.get("score"),
            venue_category=enrichment.get("venue_category"),
            menu_fit=enrichment.get("menu_fit"),
            tone_tier=enrichment.get("tone_tier"),
            lead_products=enrichment.get("lead_products", []),
            enrichment_status=enrichment.get("enrichment_status"),
            context_notes=enrichment.get("context_notes"),
            business_summary=enrichment.get("business_summary"),
            drinks_programme=enrichment.get("drinks_programme"),
            why_asterley_fits=enrichment.get("why_asterley_fits"),
            opening_hours_summary=enrichment.get("opening_hours_summary"),
            price_tier=enrichment.get("price_tier"),
            menu_fit_signals=enrichment.get("menu_fit_signals", []),
            ai_approval=enrichment.get("ai_approval"),
            ai_approval_reason=enrichment.get("ai_approval_reason"),
            google_maps_place_id=lead.get("google_maps_place_id"),
            location_postcode=lead.get("location_postcode"),
            location_city=lead.get("location_city"),
            location_area=lead.get("location_area") or enrichment.get("location_area"),
            contact_name=lead.get("contact_name") or contact.get("name"),
            contact_email=lead.get("contact_email"),
            contact_role=lead.get("contact_role") or contact.get("role"),
            contact_confidence=lead.get("contact_confidence") or contact.get("confidence"),
            email_domain=lead.get("email_domain"),
            client_status=lead.get("client_status"),
            rejection_reason=lead.get("rejection_reason"),
            batch_id=lead.get("batch_id"),
        )
    # Lead model object
    enrichment = lead.enrichment
    return LeadResponse(
        id=str(lead.id),
        business_name=lead.business_name,
        address=lead.address,
        phone=lead.phone,
        website=lead.website,
        email=lead.email,
        email_found=lead.email_found,
        source=lead.source.value if lead.source else None,
        stage=lead.stage.value if lead.stage else None,
        rating=lead.rating,
        review_count=lead.review_count,
        category=lead.category,
        scraped_at=lead.scraped_at,
        score=lead.score,
        venue_category=enrichment.venue_category.value if enrichment and enrichment.venue_category else None,
        menu_fit=enrichment.menu_fit.value if enrichment and enrichment.menu_fit else None,
        tone_tier=enrichment.tone_tier.value if enrichment and enrichment.tone_tier else None,
        lead_products=enrichment.lead_products if enrichment else [],
        enrichment_status=enrichment.enrichment_status if enrichment else None,
        context_notes=enrichment.context_notes if enrichment else None,
    )


def _run_gmaps_scrape(run_id: str, queries: list[str], limit: int, headless: bool) -> None:
    """Execute scrape → enrich → score pipeline in a background thread.

    Runs multiple queries in parallel via ParallelScrapeOrchestrator.
    """
    try:
        _scrape_runs[run_id]["status"] = "running"

        config = load_config().model_copy(deep=True)
        config.scraping.google_maps.search_queries = queries
        config.scraping.google_maps.target_count = limit
        config.scraping.google_maps.headless = headless

        def on_progress(**kwargs):
            run = _scrape_runs.get(run_id)
            if run:
                run.update({k: v for k, v in kwargs.items() if v is not None})

        orchestrator = ParallelScrapeOrchestrator(config=config, on_progress=on_progress)

        async def _full_pipeline():
            # Phase 1: Scrape
            leads = await orchestrator.scrape_gmaps()
            if not leads:
                return leads

            # Phase 2: Enrich
            on_progress(phase="enriching", progress=75)
            from src.enrichment.engine import EnrichmentEngine
            enrichment_engine = EnrichmentEngine(config=config)
            leads = await enrichment_engine.enrich_leads(leads)

            # Phase 3: Score
            on_progress(phase="scoring", progress=90)
            from src.scoring.engine import ScoringEngine
            scoring_engine = ScoringEngine(config=config)
            leads = scoring_engine.score_leads(leads)

            # Phase 4: Auto-generate drafts for leads with email
            on_progress(phase="drafting", progress=95)
            from src.db.firestore import get_outreach_messages, save_outreach_message
            from src.db.models import OutreachChannel
            from src.outreach.drafts import DraftGenerator

            generator = DraftGenerator(config=config)
            existing_messages = get_outreach_messages()
            leads_with_drafts = {m.get("lead_id") for m in existing_messages}

            for lead in leads:
                if not lead.email:
                    continue
                if str(lead.id) in leads_with_drafts:
                    continue
                # Skip leads without enrichment — emails will be too generic
                if not lead.enrichment or not lead.enrichment.venue_category:
                    continue
                if not (lead.enrichment.context_notes or lead.enrichment.drinks_programme or lead.enrichment.business_summary):
                    continue
                try:
                    message = generator.generate_draft(lead, OutreachChannel.EMAIL)
                    enrichment = lead.enrichment
                    contact = enrichment.contact if enrichment else None
                    msg_data = {
                        "id": str(message.id),
                        "lead_id": str(lead.id),
                        "business_name": lead.business_name,
                        "venue_category": enrichment.venue_category.value if enrichment and enrichment.venue_category else None,
                        "channel": message.channel.value,
                        "subject": message.subject,
                        "content": message.content,
                        "status": "draft",
                        "step_number": 1,
                        "created_at": message.created_at.isoformat(),
                        "tone_tier": enrichment.tone_tier.value if enrichment and enrichment.tone_tier else None,
                        "lead_products": enrichment.lead_products if enrichment else [],
                        "contact_name": contact.name if contact else None,
                        "context_notes": enrichment.context_notes if enrichment else None,
                        "menu_fit": enrichment.menu_fit.value if enrichment and enrichment.menu_fit else None,
                    }
                    save_outreach_message(msg_data)
                    from src.db.firestore import update_lead as _update_lead
                    _update_lead(str(lead.id), {"stage": "draft_generated"})
                except Exception as exc:
                    log.warning("auto_draft_failed", lead=lead.business_name, error=str(exc))

            return leads

        leads = asyncio.run(_full_pipeline())

        lead_responses = [_lead_to_response(lead) for lead in leads]

        _scrape_leads[run_id] = lead_responses
        from src.events import emit
        emit("leads_updated", count=len(lead_responses))
        _scrape_runs[run_id].update(
            status="completed",
            leads_found=len(lead_responses),
            completed_at=datetime.now(),
            phase="done",
            progress=100,
            current_lead=None,
        )
        log.info("scrape_thread_done", run_id=run_id, leads=len(lead_responses))

    except Exception as exc:
        _scrape_runs[run_id].update(
            status="failed",
            error=str(exc),
            completed_at=datetime.now(),
        )
        log.exception("scrape_thread_failed", run_id=run_id)


def _run_enrichment(run_id: str, lead_ids: list[str] | None, limit: int | None = None, force: bool = False) -> None:
    """Enrich leads in a background thread."""
    try:
        _enrich_runs[run_id]["status"] = "running"

        from src.db.firestore import get_leads, get_leads_by_stage, update_lead
        from src.db.models import Lead, LeadSource
        from src.enrichment.engine import EnrichmentEngine

        # Get leads to enrich
        if lead_ids:
            from src.db.firestore import get_lead_by_id
            docs = [get_lead_by_id(lid) for lid in lead_ids]
            docs = [d for d in docs if d]
        elif force:
            # Re-enrich all leads regardless of stage
            docs = get_leads()
            if limit:
                docs.sort(key=lambda d: d.get("scraped_at", ""), reverse=True)
                docs = docs[:limit]
        else:
            docs = get_leads_by_stage("scraped") + get_leads_by_stage("needs_email")
            if limit:
                docs.sort(key=lambda d: d.get("scraped_at", ""), reverse=True)
                docs = docs[:limit]

        # Reconstruct Lead models
        leads = []
        for doc in docs:
            try:
                lead = Lead(
                    id=doc.get("id", doc.get("lead_id")),
                    source=LeadSource(doc["source"]),
                    business_name=doc["business_name"],
                    address=doc.get("address"),
                    phone=doc.get("phone"),
                    website=doc.get("website"),
                    email=doc.get("email"),
                    email_found=doc.get("email_found", False),
                    rating=doc.get("rating"),
                    review_count=doc.get("review_count"),
                    category=doc.get("category"),
                    instagram_handle=doc.get("instagram_handle"),
                    instagram_followers=doc.get("instagram_followers"),
                )
                leads.append(lead)
            except Exception as exc:
                log.warning("lead_reconstruct_failed", doc_id=doc.get("id"), source=doc.get("source"), error=str(exc))

        _enrich_runs[run_id]["total"] = len(leads)
        log.info("enrichment_leads_found", total_docs=len(docs), reconstructed=len(leads))

        config = load_config()
        engine = EnrichmentEngine(config=config)
        enriched = asyncio.run(engine.enrich_leads(leads))

        # Update leads in Firestore
        for lead in enriched:
            if lead.enrichment:
                updates = {
                    "enrichment": lead.enrichment.model_dump(mode="json"),
                    "enriched_at": lead.enriched_at.isoformat() if lead.enriched_at else None,
                    "stage": lead.stage.value,
                }
                update_lead(str(lead.id), updates)

        success = sum(1 for l in enriched if l.enrichment and l.enrichment.enrichment_status == "success")
        failed = sum(1 for l in enriched if l.enrichment and l.enrichment.enrichment_status == "failed")
        skipped = sum(1 for l in enriched if l.enrichment and l.enrichment.enrichment_status == "skipped")

        _enrich_runs[run_id].update(
            status="completed",
            enriched=success,
            failed=failed,
            skipped=skipped,
            completed_at=datetime.now(),
        )
        log.info("enrich_thread_done", run_id=run_id, enriched=success, failed=failed, skipped=skipped)

    except Exception as exc:
        _enrich_runs[run_id].update(status="failed", error=str(exc), completed_at=datetime.now())
        log.exception("enrich_thread_failed", run_id=run_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/config", response_model=ConfigResponse)
async def get_config() -> ConfigResponse:
    env_status = {var: bool(os.environ.get(var)) for var in _ENV_VARS_TO_CHECK}
    config = load_config()
    return ConfigResponse(
        env_vars=env_status,
        search_queries=config.scraping.google_maps.search_queries,
    )


@router.post("/scrape", response_model=ScrapeStatusResponse)
async def start_scrape(req: ScrapeRequest) -> ScrapeStatusResponse:
    run_id = str(uuid4())
    now = datetime.now()

    _scrape_runs[run_id] = {
        "status": "pending",
        "leads_found": 0,
        "error": None,
        "started_at": now,
        "completed_at": None,
        "phase": None,
        "progress": 0,
        "cards_found": 0,
        "current_lead": None,
    }

    # Support both single query (legacy) and multiple queries (parallel)
    queries = req.queries if req.queries else [req.query] if req.query else []
    if not queries:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="At least one query is required")

    thread = threading.Thread(
        target=_run_gmaps_scrape,
        args=(run_id, queries, req.limit, req.headless),
        daemon=True,
    )
    thread.start()

    return ScrapeStatusResponse(run_id=run_id, status="pending", started_at=now)


@router.get("/scrape-status/{run_id}", response_model=ScrapeStatusResponse)
async def scrape_status(run_id: str) -> ScrapeStatusResponse:
    run = _scrape_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return ScrapeStatusResponse(run_id=run_id, **run)


@router.get("/leads", response_model=list[LeadResponse])
async def list_leads(
    source: str | None = None,
    stage: str | None = None,
    search: str | None = None,
) -> list[LeadResponse]:
    from src.db.firestore import get_leads

    docs = get_leads(source=source, stage=stage, search=search)
    if docs:
        return [_lead_to_response(doc) for doc in docs]

    # Deduplicate in-memory leads across all scrape runs
    seen: set[str] = set()
    all_leads: list[LeadResponse] = []
    for leads in _scrape_leads.values():
        for lead in leads:
            key = f"{lead.business_name}|{lead.address or ''}"
            if key not in seen:
                seen.add(key)
                all_leads.append(lead)
    return all_leads


@router.patch("/leads/{lead_id}")
async def update_lead_status(lead_id: str, body: dict):
    """Update lead fields like client_status, rejection_reason."""
    from src.db.firestore import update_lead

    allowed = {"client_status", "rejection_reason", "provider_qa_status", "provider_qa_notes"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    success = update_lead(lead_id, updates)
    if not success:
        raise HTTPException(status_code=404, detail="Lead not found or update failed")

    return {"status": "updated", "lead_id": lead_id, **updates}


@router.get("/leads/{lead_id}")
async def get_lead_detail(lead_id: str):
    """Full lead detail including enrichment breakdown and outreach messages."""
    from src.api.schemas import LeadDetailResponse, OutreachMessageResponse
    from src.db.firestore import get_lead_by_id, get_outreach_messages

    doc = get_lead_by_id(lead_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Lead not found")

    enrichment = doc.get("enrichment") or {}
    contact = enrichment.get("contact") or {}

    # Get outreach messages for this lead
    msgs = get_outreach_messages(lead_id=lead_id)
    msg_responses = []
    for msg in msgs:
        msg_responses.append(OutreachMessageResponse(
            id=msg.get("id", ""),
            lead_id=msg.get("lead_id", ""),
            business_name=doc.get("business_name", ""),
            venue_category=enrichment.get("venue_category"),
            channel=msg.get("channel", "email"),
            subject=msg.get("subject"),
            content=msg.get("content", ""),
            status=msg.get("status", "draft"),
            step_number=msg.get("step_number", 1),
            created_at=msg.get("created_at"),
            tone_tier=enrichment.get("tone_tier"),
            lead_products=enrichment.get("lead_products", []),
            contact_name=contact.get("name"),
            context_notes=enrichment.get("context_notes"),
            menu_fit=enrichment.get("menu_fit"),
        ))

    return LeadDetailResponse(
        id=doc.get("id", ""),
        business_name=doc.get("business_name", ""),
        address=doc.get("address"),
        phone=doc.get("phone"),
        website=doc.get("website"),
        email=doc.get("email"),
        email_found=doc.get("email_found", False),
        source=doc.get("source"),
        stage=doc.get("stage"),
        rating=doc.get("rating"),
        review_count=doc.get("review_count"),
        category=doc.get("category"),
        scraped_at=doc.get("scraped_at"),
        score=doc.get("score"),
        venue_category=enrichment.get("venue_category"),
        menu_fit=enrichment.get("menu_fit"),
        tone_tier=enrichment.get("tone_tier"),
        lead_products=enrichment.get("lead_products", []),
        enrichment_status=enrichment.get("enrichment_status"),
        context_notes=enrichment.get("context_notes"),
        menu_fit_signals=enrichment.get("menu_fit_signals", []),
        google_maps_place_id=doc.get("google_maps_place_id"),
        location_postcode=doc.get("location_postcode"),
        location_city=doc.get("location_city"),
        location_area=doc.get("location_area"),
        opening_hours=doc.get("opening_hours"),
        contact_name=doc.get("contact_name") or contact.get("name"),
        contact_email=doc.get("contact_email"),
        contact_role=doc.get("contact_role") or contact.get("role"),
        contact_confidence=doc.get("contact_confidence") or contact.get("confidence"),
        email_domain=doc.get("email_domain"),
        instagram_handle=doc.get("instagram_handle"),
        instagram_followers=doc.get("instagram_followers"),
        instagram_bio=doc.get("instagram_bio"),
        client_status=doc.get("client_status"),
        rejection_reason=doc.get("rejection_reason"),
        batch_id=doc.get("batch_id"),
        provider_qa_status=doc.get("provider_qa_status"),
        provider_qa_notes=doc.get("provider_qa_notes"),
        score_breakdown=doc.get("score_breakdown"),
        outreach_messages=msg_responses,
    )


@router.get("/leads/export")
async def export_leads() -> StreamingResponse:
    all_leads = await list_leads()

    output = io.StringIO()
    fieldnames = [
        "business_name", "address", "phone", "website", "email",
        "rating", "review_count", "category", "venue_category",
        "menu_fit", "score", "stage",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for lead in all_leads:
        writer.writerow({k: getattr(lead, k, None) for k in fieldnames})

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"},
    )


# ---------------------------------------------------------------------------
# Enrichment & Scoring
# ---------------------------------------------------------------------------


@router.post("/enrich", response_model=EnrichStatusResponse)
async def start_enrichment(req: EnrichRequest) -> EnrichStatusResponse:
    run_id = str(uuid4())
    _enrich_runs[run_id] = {
        "status": "pending",
        "total": 0,
        "enriched": 0,
        "failed": 0,
        "skipped": 0,
    }

    thread = threading.Thread(
        target=_run_enrichment,
        args=(run_id, req.lead_ids, req.limit, req.force),
        daemon=True,
    )
    thread.start()

    return EnrichStatusResponse(run_id=run_id, status="pending")


@router.get("/enrich-status/{run_id}", response_model=EnrichStatusResponse)
async def enrich_status(run_id: str) -> EnrichStatusResponse:
    run = _enrich_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Enrichment run not found")
    return EnrichStatusResponse(run_id=run_id, **run)


@router.post("/score", response_model=ScoreStatusResponse)
async def score_leads_endpoint() -> ScoreStatusResponse:
    """Score all enriched leads. Synchronous — scoring is fast."""
    from src.db.firestore import get_leads_by_stage, update_lead
    from src.db.models import EnrichmentData, Lead, LeadSource
    from src.scoring.engine import ScoringEngine

    docs = get_leads_by_stage("enriched")
    if not docs:
        return ScoreStatusResponse(total=0)

    leads = []
    for doc in docs:
        try:
            enrichment_data = None
            if doc.get("enrichment"):
                enrichment_data = EnrichmentData(**doc["enrichment"])
            lead = Lead(
                id=doc.get("id"),
                source=LeadSource(doc["source"]),
                business_name=doc["business_name"],
                address=doc.get("address"),
                phone=doc.get("phone"),
                website=doc.get("website"),
                email=doc.get("email"),
                email_found=doc.get("email_found", False),
                rating=doc.get("rating"),
                review_count=doc.get("review_count"),
                category=doc.get("category"),
                instagram_handle=doc.get("instagram_handle"),
                instagram_followers=doc.get("instagram_followers"),
                enrichment=enrichment_data,
            )
            leads.append(lead)
        except Exception:
            log.debug("lead_reconstruct_failed", doc_id=doc.get("id"))

    engine = ScoringEngine()
    scored = engine.score_leads(leads)

    above = 0
    below = 0
    for lead in scored:
        stage_val = lead.stage.value if hasattr(lead.stage, "value") else str(lead.stage)
        updates = {
            "score": lead.score,
            "score_breakdown": {k: v.model_dump() for k, v in lead.score_breakdown.items()} if lead.score_breakdown else {},
            "stage": stage_val,
        }
        update_lead(str(lead.id), updates)
        if engine.passes_threshold(lead):
            above += 1
        else:
            below += 1

    return ScoreStatusResponse(
        total=len(scored),
        scored=len(scored),
        above_threshold=above,
        below_threshold=below,
    )


# ---------------------------------------------------------------------------
# Lead Ratios
# ---------------------------------------------------------------------------


@router.get("/ratios")
async def get_ratios():
    from src.db.firestore import get_config as get_fs_config
    from src.db.firestore import get_leads
    from src.pipeline.tracker import PipelineTracker

    config = load_config()
    # Check for Firestore overrides
    fs_ratios = get_fs_config("lead_ratios")
    ratios = config.lead_ratios
    if fs_ratios:
        from src.config.loader import LeadRatiosConfig
        ratios = LeadRatiosConfig(**fs_ratios)

    # Get actual distribution
    docs = get_leads()
    category_counts = PipelineTracker.get_category_counts_from_docs(docs)
    actual = PipelineTracker.get_category_distribution(category_counts)
    deficits = PipelineTracker.get_deficit_categories(actual, ratios)

    return {"target": ratios.model_dump(), "actual": actual, "deficits": deficits}


@router.put("/ratios")
async def update_ratios(req: RatioUpdateRequest):
    from src.db.firestore import save_config as save_fs_config

    save_fs_config("lead_ratios", req.ratios)
    return {"status": "updated", "ratios": req.ratios}


@router.get("/ratios/suggestions")
async def get_ratio_suggestions():
    from src.db.firestore import get_config as get_fs_config
    from src.db.firestore import get_leads
    from src.pipeline.query_suggester import suggest_queries
    from src.pipeline.tracker import PipelineTracker

    config = load_config()
    fs_ratios = get_fs_config("lead_ratios")
    ratios = config.lead_ratios
    if fs_ratios:
        from src.config.loader import LeadRatiosConfig
        ratios = LeadRatiosConfig(**fs_ratios)

    docs = get_leads()
    category_counts = PipelineTracker.get_category_counts_from_docs(docs)
    actual = PipelineTracker.get_category_distribution(category_counts)
    deficits = PipelineTracker.get_deficit_categories(actual, ratios)

    suggestions = suggest_queries(deficits, config.scraping.google_maps.search_queries)
    return {"suggestions": suggestions}
