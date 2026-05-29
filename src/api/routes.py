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
    LinkedInEmployeeResponse,
    LinkedInScrapeRequest,
    LinkedInScrapeStatusResponse,
    RatioUpdateRequest,
    ScoreStatusResponse,
    QuickAddRequest,
    QuickAddResponse,
    ScrapeBatchItem,
    ScrapeBatchRequest,
    ScrapeBatchStatusResponse,
    ScrapeOneRequest,
    ScrapeOneResponse,
    ScrapeRequest,
    ScrapeSelectedRequest,
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
_linkedin_runs: dict[str, dict] = {}  # run_id -> LinkedIn scrape status
_linkedin_lock = threading.Lock()  # only one LinkedIn scrape at a time per VPS
_scrape_batches: dict[str, dict] = {}  # batch_id -> bulk scrape-one progress
_scrape_batch_lock = threading.Lock()
_linkedin_running: bool = False


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
    from uuid import UUID
    from src.db.firestore import save_scrape_run, update_scrape_run
    from src.db.models import LeadSource, RunStatus, ScrapeRun

    # Persist a scrape_runs Firestore doc keyed on the API run_id so manual
    # scrapes from the app show up in the history list alongside CLI runs.
    try:
        scrape_run = ScrapeRun(
            id=UUID(run_id),
            source=LeadSource.GOOGLE_MAPS,
            query=", ".join(queries),
            status=RunStatus.RUNNING,
        )
        save_scrape_run(scrape_run)
    except Exception as exc:
        log.warning("scrape_run_persist_failed", run_id=run_id, error=str(exc))

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

        try:
            update_scrape_run(run_id, {
                "status": RunStatus.COMPLETED.value,
                "leads_found": len(lead_responses),
                "completed_at": datetime.now().isoformat(),
            })
        except Exception as exc:
            log.warning("scrape_run_finalize_failed", run_id=run_id, error=str(exc))

    except Exception as exc:
        _scrape_runs[run_id].update(
            status="failed",
            error=str(exc),
            completed_at=datetime.now(),
        )
        log.exception("scrape_thread_failed", run_id=run_id)

        try:
            update_scrape_run(run_id, {
                "status": RunStatus.FAILED.value,
                "error": str(exc),
                "completed_at": datetime.now().isoformat(),
            })
        except Exception as exc2:
            log.warning("scrape_run_finalize_failed", run_id=run_id, error=str(exc2))


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


@router.post("/scrape-one", response_model=ScrapeOneResponse)
async def scrape_one(req: ScrapeOneRequest) -> ScrapeOneResponse:
    """Scrape a single venue from a user-supplied input (gmaps URL / website / name).

    Synchronous: returns when the lead is extracted and saved (~15-45 s).
    Reuses the same dedup_claims atomic save as bulk scrapes.
    """
    from src.scrapers.single_venue import scrape_single_venue

    result = await scrape_single_venue(req.input)

    if not result.lead:
        return ScrapeOneResponse(
            ok=False,
            is_new=False,
            detected_kind=result.detected_kind,
            error=result.error or "Could not extract venue details.",
        )

    enrichment = result.lead.enrichment
    venue_category = (
        enrichment.venue_category.value
        if enrichment and enrichment.venue_category
        else None
    )

    return ScrapeOneResponse(
        ok=True,
        is_new=result.is_new,
        detected_kind=result.detected_kind,
        lead_id=str(result.lead.id),
        business_name=result.lead.business_name,
        address=result.lead.address,
        phone=result.lead.phone,
        website=result.lead.website,
        score=result.lead.score,
        enriched=result.enriched,
        scored=result.scored,
        venue_category=venue_category,
    )


def _run_scrape_batch(batch_id: str, inputs: list[str]) -> None:
    """Background thread: process pasted inputs one at a time through
    scrape_single_venue, updating the in-memory batch dict after each item.

    Serial on purpose — concurrency=1 protects the VPS from OOM.
    """
    from src.scrapers.single_venue import scrape_single_venue

    def _update(**fields):
        with _scrape_batch_lock:
            _scrape_batches[batch_id].update(fields)

    def _set_item(idx: int, **fields):
        with _scrape_batch_lock:
            _scrape_batches[batch_id]["items"][idx].update(fields)

    _update(status="running")

    for idx, raw in enumerate(inputs):
        _set_item(idx, status="running")
        try:
            result = asyncio.run(scrape_single_venue(raw))
        except Exception as exc:
            log.exception("scrape_batch_item_failed", batch_id=batch_id, idx=idx)
            _set_item(idx, status="error", error=str(exc))
            with _scrape_batch_lock:
                _scrape_batches[batch_id]["failed"] += 1
                _scrape_batches[batch_id]["completed"] += 1
            continue

        if not result.lead:
            _set_item(
                idx,
                status="error",
                detected_kind=result.detected_kind,
                error=result.error or "Could not extract venue details.",
            )
            with _scrape_batch_lock:
                _scrape_batches[batch_id]["failed"] += 1
                _scrape_batches[batch_id]["completed"] += 1
            continue

        if result.is_new:
            _set_item(
                idx,
                status="added",
                business_name=result.lead.business_name,
                detected_kind=result.detected_kind,
                lead_id=str(result.lead.id),
            )
            with _scrape_batch_lock:
                _scrape_batches[batch_id]["added"] += 1
        else:
            _set_item(
                idx,
                status="duplicate",
                business_name=result.lead.business_name,
                detected_kind=result.detected_kind,
                lead_id=str(result.lead.id),
            )
            with _scrape_batch_lock:
                _scrape_batches[batch_id]["duplicate"] += 1

        with _scrape_batch_lock:
            _scrape_batches[batch_id]["completed"] += 1

    _update(status="completed", completed_at=datetime.now().isoformat())
    log.info("scrape_batch_done", batch_id=batch_id, total=len(inputs))


@router.post("/scrape-batch", response_model=ScrapeBatchStatusResponse)
async def start_scrape_batch(req: ScrapeBatchRequest) -> ScrapeBatchStatusResponse:
    """Kick off a serial bulk single-venue scrape.

    Returns the batch_id immediately. Poll /scrape-batch/{batch_id} for progress.
    """
    cleaned = [s.strip() for s in req.inputs if isinstance(s, str) and s.strip()]
    if not cleaned:
        raise HTTPException(status_code=400, detail="No usable inputs in request.")

    batch_id = str(uuid4())
    started_at = datetime.now().isoformat()

    with _scrape_batch_lock:
        _scrape_batches[batch_id] = {
            "batch_id": batch_id,
            "status": "pending",
            "total": len(cleaned),
            "completed": 0,
            "added": 0,
            "duplicate": 0,
            "failed": 0,
            "started_at": started_at,
            "completed_at": None,
            "items": [
                {"input": raw, "status": "pending", "business_name": None,
                 "detected_kind": None, "lead_id": None, "error": None}
                for raw in cleaned
            ],
        }

    threading.Thread(
        target=_run_scrape_batch,
        args=(batch_id, cleaned),
        daemon=True,
    ).start()

    return _batch_state_to_response(batch_id)


@router.get("/scrape-batch/{batch_id}", response_model=ScrapeBatchStatusResponse)
async def get_scrape_batch(batch_id: str) -> ScrapeBatchStatusResponse:
    if batch_id not in _scrape_batches:
        raise HTTPException(status_code=404, detail="Batch not found")
    return _batch_state_to_response(batch_id)


def _batch_state_to_response(batch_id: str) -> ScrapeBatchStatusResponse:
    """Snapshot the in-memory batch dict into the pydantic response model."""
    with _scrape_batch_lock:
        b = _scrape_batches[batch_id]
        items = [ScrapeBatchItem(**item) for item in b["items"]]
        return ScrapeBatchStatusResponse(
            batch_id=batch_id,
            status=b["status"],
            total=b["total"],
            completed=b["completed"],
            added=b["added"],
            duplicate=b["duplicate"],
            failed=b["failed"],
            started_at=b["started_at"],
            completed_at=b.get("completed_at"),
            items=items,
        )


# ---------------------------------------------------------------------------
# Quick-add (skeleton leads, no scrape)
# ---------------------------------------------------------------------------


@router.post("/leads/quick-add", response_model=QuickAddResponse)
async def quick_add_leads(req: QuickAddRequest) -> QuickAddResponse:
    """Insert pasted text as skeleton leads via the same Gemini text-parser
    that powers email ingestion. No browser, no Google Maps — just Gemini
    structuring the text into {business_name, website, address, ...} dicts.

    Falls back to literal "one line = one lead" if Gemini is unavailable.
    """
    from src.db.firestore import save_lead_immediate
    from src.db.models import Lead, LeadSource, PipelineStage
    from src.scrapers.single_venue import _normalize_input
    from src.scrapers.text_lead_parser import parse_leads_from_text

    added = 0
    duplicate = 0
    lead_ids: list[str] = []

    # Concatenate the inputs into one text block — the parser handles
    # numbered lists, free-form context, multi-line entries, etc.
    text_block = "\n".join(s for s in req.inputs if isinstance(s, str) and s.strip())
    parsed = parse_leads_from_text(text_block) if text_block else []

    # Fallback: if Gemini returned nothing, treat each line as a literal name.
    if not parsed:
        log.info("quick_add_fallback_literal", lines=len(req.inputs))
        parsed = []
        for raw in req.inputs:
            cleaned = _normalize_input(raw or "")
            if cleaned:
                parsed.append({"business_name": cleaned})

    for item in parsed:
        name = (item.get("business_name") or "").strip()
        website = (item.get("website") or "").strip() or None
        if not name and not website:
            continue
        if not name and website:
            # Derive a name from the domain so the row is identifiable.
            from urllib.parse import urlparse as _u
            host = _u(website).netloc.removeprefix("www.")
            name = host.split(".")[0].replace("-", " ").title() if host else "Unknown"

        lead = Lead(
            source=LeadSource.MANUAL,
            business_name=name,
            website=website,
            phone=item.get("phone") or None,
            address=item.get("address") or None,
            google_maps_place_id=None,
            stage=PipelineStage.SCRAPED,
        )
        try:
            is_new = save_lead_immediate(lead)
        except Exception as exc:
            log.warning("quick_add_save_failed", input=name, error=str(exc))
            continue

        # Stamp enrichment_status = pending on the freshly saved doc so the
        # UI can show the "needs scrape" badge.
        try:
            from src.db.firestore import update_lead as _update_lead
            _update_lead(str(lead.id), {
                "enrichment_status": "pending",
                "notes": item.get("notes") or None,
            })
        except Exception:
            pass

        if is_new:
            added += 1
        else:
            duplicate += 1
        lead_ids.append(str(lead.id))

    log.info("quick_add_done", parsed=len(parsed), added=added, duplicate=duplicate)
    return QuickAddResponse(added=added, duplicate=duplicate, lead_ids=lead_ids)


# ---------------------------------------------------------------------------
# Scrape an existing skeleton lead (or re-scrape a real one) by lead_id
# ---------------------------------------------------------------------------


@router.post("/leads/{lead_id}/scrape-now", response_model=ScrapeOneResponse)
async def scrape_lead_by_id(lead_id: str) -> ScrapeOneResponse:
    """Enrich an existing lead. Same pipeline as email ingestion:

      1. If the lead has a Google Maps URL → use the Maps scraper path
         to fill out address/phone (B2C venues).
      2. Else if it has a website → run the enrichment engine (visits site,
         Gemini reads it, fills in category/products/etc.).
      3. Else → ask Gemini to look up the business by name. If a website
         shows up, enrich from there. Otherwise mark enrichment_status=failed.

    No Google Maps name-search step (that's where the prior failures came
    from for B2B wholesalers).
    """
    from src.db.firestore import get_lead_by_id, update_lead
    from src.db.models import Lead, LeadSource, PipelineStage
    from src.scrapers.single_venue import (
        _detect_input_kind,
        scrape_single_venue,
        _enrich_and_score,
    )
    from src.scrapers.text_lead_parser import parse_leads_from_text

    existing = get_lead_by_id(lead_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")

    business_name = (existing.get("business_name") or "").strip()
    website = (existing.get("website") or "").strip() or None
    maps_url = (existing.get("google_maps_url") or "").strip() or None
    notes = existing.get("notes")

    # 1) Google Maps URL → reuse the venue-page scrape (gives us a confident
    # address/phone/place_id without depending on a search guess).
    if maps_url and _detect_input_kind(maps_url) == "gmaps_url":
        result = await scrape_single_venue(maps_url)
        if result.lead:
            updates = {
                k: v for k, v in result.lead.model_dump(mode="json", exclude_none=True).items()
                if k not in ("id", "scraped_at", "stage")
            }
            updates["enrichment_status"] = "success" if result.enriched else "pending"
            update_lead(lead_id, updates)
            enrichment = result.lead.enrichment
            return ScrapeOneResponse(
                ok=True, is_new=False, detected_kind="gmaps_url", lead_id=lead_id,
                business_name=result.lead.business_name, address=result.lead.address,
                phone=result.lead.phone, website=result.lead.website,
                score=result.lead.score, enriched=result.enriched, scored=result.scored,
                venue_category=enrichment.venue_category.value if enrichment and enrichment.venue_category else None,
            )

    # 2) No website yet — use Gemini with Google Search grounding to
    # research the business from name + any notes. This is the same trick
    # email ingestion uses for low-info leads: let the model find a Maps
    # listing, LinkedIn page, news mention, anything — not just websites.
    if not website and business_name:
        from src.scrapers.text_lead_parser import research_lead_via_gemini

        research_seed = business_name + (("\n\n" + notes) if notes else "")
        researched = research_lead_via_gemini(research_seed)

        if researched:
            # Persist everything Gemini found onto the lead, including the
            # research-derived enrichment data so the lead is usable even
            # if there's no scrapeable website at the end.
            patch = {}
            if researched.get("website"):
                website = researched["website"]
                patch["website"] = website
            if researched.get("business_name") and researched["business_name"] != business_name:
                patch["business_name"] = researched["business_name"]
                patch["business_name_lower"] = researched["business_name"].lower()
            for k in ("phone", "address", "location_area", "location_postcode"):
                v = researched.get(k)
                if v and not existing.get(k):
                    patch[k] = v
            # Build a structured enrichment payload from the research output.
            patch["enrichment"] = {
                "venue_category": researched.get("venue_category"),
                "business_summary": researched.get("business_summary"),
                "location_area": researched.get("location_area"),
                "menu_fit": researched.get("menu_fit") or "unknown",
                "drinks_programme": researched.get("drinks_programme"),
                "context_notes": researched.get("notes"),
                "enrichment_status": "success",
                "enrichment_source": "gemini_research",
            }
            patch["venue_category"] = researched.get("venue_category")
            patch["menu_fit"] = researched.get("menu_fit")
            patch["enrichment_status"] = "success"
            patch["notes"] = researched.get("notes") or notes
            try:
                update_lead(lead_id, patch)
            except Exception as exc:
                log.warning("research_patch_failed", lead_id=lead_id, error=str(exc))
            existing.update(patch)

            # If the research surfaced a website, fall through to step 3 to
            # run full website enrichment for the deeper signal. Otherwise
            # return what we have — the lead is now usable.
            if not website:
                return ScrapeOneResponse(
                    ok=True, is_new=False, detected_kind="name", lead_id=lead_id,
                    business_name=patch.get("business_name", business_name),
                    address=patch.get("address") or existing.get("address"),
                    phone=patch.get("phone") or existing.get("phone"),
                    website=None,
                    enriched=True, scored=False,
                    venue_category=researched.get("venue_category"),
                )

    # 3) Run the standard enrichment engine on the website (mirrors what the
    # bulk pipeline and email-ingestion follow-up do).
    if website:
        try:
            lead_obj = Lead(
                id=lead_id,
                source=LeadSource(existing.get("source", "manual")),
                business_name=business_name or "Unknown",
                website=website,
                phone=existing.get("phone"),
                address=existing.get("address"),
                stage=PipelineStage.SCRAPED,
            )
        except Exception:
            # Fall back to a minimal Lead if the existing source value is unknown.
            lead_obj = Lead(
                source=LeadSource.MANUAL,
                business_name=business_name or "Unknown",
                website=website,
                stage=PipelineStage.SCRAPED,
            )

        enriched, scored = await _enrich_and_score(lead_obj, log_prefix=business_name)
        updates = {
            k: v for k, v in lead_obj.model_dump(mode="json", exclude_none=True).items()
            if k not in ("id", "scraped_at", "stage")
        }
        updates["enrichment_status"] = "success" if enriched else "failed"
        update_lead(lead_id, updates)

        enrichment = lead_obj.enrichment
        return ScrapeOneResponse(
            ok=True, is_new=False, detected_kind="website_url", lead_id=lead_id,
            business_name=lead_obj.business_name, address=lead_obj.address,
            phone=lead_obj.phone, website=lead_obj.website,
            score=lead_obj.score, enriched=enriched, scored=scored,
            venue_category=enrichment.venue_category.value if enrichment and enrichment.venue_category else None,
        )

    # 4) Nothing we can do — mark failed so the UI shows it clearly.
    update_lead(lead_id, {"enrichment_status": "failed"})
    return ScrapeOneResponse(
        ok=False, is_new=False, detected_kind="name", lead_id=lead_id,
        business_name=business_name,
        error="Gemini couldn't find this business online. Edit the lead — add a website or more context — and try again.",
    )


# ---------------------------------------------------------------------------
# Bulk scrape selected leads (by ID)
# ---------------------------------------------------------------------------


def _run_lead_scrape_batch(batch_id: str, lead_ids: list[str]) -> None:
    """Background worker: scrape+enrich each existing lead one at a time."""
    from src.db.firestore import get_lead_by_id, update_lead
    from src.scrapers.single_venue import scrape_single_venue

    def _update(**fields):
        with _scrape_batch_lock:
            _scrape_batches[batch_id].update(fields)

    def _set_item(idx: int, **fields):
        with _scrape_batch_lock:
            _scrape_batches[batch_id]["items"][idx].update(fields)

    _update(status="running")

    for idx, lid in enumerate(lead_ids):
        _set_item(idx, status="running")
        existing = None
        try:
            existing = get_lead_by_id(lid)
        except Exception as exc:
            log.warning("batch_lead_lookup_failed", lead_id=lid, error=str(exc))

        if not existing:
            _set_item(idx, status="error", error="Lead not found")
            with _scrape_batch_lock:
                _scrape_batches[batch_id]["failed"] += 1
                _scrape_batches[batch_id]["completed"] += 1
            continue

        seed = existing.get("website") or existing.get("business_name") or ""
        if not seed:
            _set_item(idx, status="error", business_name=existing.get("business_name"),
                      error="Lead has no website or business_name to scrape.")
            with _scrape_batch_lock:
                _scrape_batches[batch_id]["failed"] += 1
                _scrape_batches[batch_id]["completed"] += 1
            continue

        try:
            result = asyncio.run(scrape_single_venue(seed))
        except Exception as exc:
            log.exception("batch_lead_scrape_failed", lead_id=lid)
            _set_item(idx, status="error", business_name=existing.get("business_name"), error=str(exc))
            with _scrape_batch_lock:
                _scrape_batches[batch_id]["failed"] += 1
                _scrape_batches[batch_id]["completed"] += 1
            continue

        if not result.lead:
            _set_item(idx, status="error",
                      business_name=existing.get("business_name"),
                      detected_kind=result.detected_kind,
                      error=result.error or "Could not extract venue details.")
            with _scrape_batch_lock:
                _scrape_batches[batch_id]["failed"] += 1
                _scrape_batches[batch_id]["completed"] += 1
            continue

        # Merge onto existing doc (preserve lead_id).
        try:
            updates = {
                k: v for k, v in result.lead.model_dump(mode="json", exclude_none=True).items()
                if k not in ("id", "scraped_at", "stage")
            }
            updates["enrichment_status"] = "success" if result.enriched else (
                existing.get("enrichment_status") or "pending"
            )
            update_lead(lid, updates)
        except Exception as exc:
            log.warning("batch_lead_update_failed", lead_id=lid, error=str(exc))

        _set_item(idx, status="added",
                  business_name=result.lead.business_name,
                  detected_kind=result.detected_kind,
                  lead_id=lid)
        with _scrape_batch_lock:
            _scrape_batches[batch_id]["added"] += 1
            _scrape_batches[batch_id]["completed"] += 1

    _update(status="completed", completed_at=datetime.now().isoformat())
    log.info("batch_lead_scrape_done", batch_id=batch_id, total=len(lead_ids))


@router.post("/leads/scrape-selected", response_model=ScrapeBatchStatusResponse)
async def scrape_selected_leads(req: ScrapeSelectedRequest) -> ScrapeBatchStatusResponse:
    """Kick off a serial bulk re-scrape of existing leads by lead_id.

    Reuses the same in-memory batch tracker the /scrape-batch endpoint uses.
    """
    ids = [s for s in req.lead_ids if isinstance(s, str) and s.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="No lead_ids supplied.")

    batch_id = str(uuid4())
    started_at = datetime.now().isoformat()

    with _scrape_batch_lock:
        _scrape_batches[batch_id] = {
            "batch_id": batch_id,
            "status": "pending",
            "total": len(ids),
            "completed": 0,
            "added": 0,
            "duplicate": 0,
            "failed": 0,
            "started_at": started_at,
            "completed_at": None,
            "items": [
                {"input": lid, "status": "pending", "business_name": None,
                 "detected_kind": None, "lead_id": lid, "error": None}
                for lid in ids
            ],
        }

    threading.Thread(
        target=_run_lead_scrape_batch,
        args=(batch_id, ids),
        daemon=True,
    ).start()

    return _batch_state_to_response(batch_id)


def _send_linkedin_alert(subject: str, body: str) -> None:
    """Fire-and-forget Resend email to all admin users."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        return
    try:
        import httpx
        from src.db.client import get_firestore_client
        db = get_firestore_client()
        if not db:
            return
        admin_snap = db.collection("users").where("role", "==", "admin").stream()
        admin_emails = [d.to_dict().get("email") for d in admin_snap]
        admin_emails = [e for e in admin_emails if e]
        if not admin_emails:
            return
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        for email in admin_emails:
            httpx.post(
                "https://api.resend.com/emails",
                headers=headers,
                json={
                    "from": "Asterley Bros Alerts <alerts@asterleybros.com>",
                    "to": email,
                    "subject": subject,
                    "text": body,
                },
                timeout=10,
            )
    except Exception as exc:
        log.warning("linkedin_alert_send_failed", error=str(exc))


def _run_linkedin_scrape(
    run_id: str, lead_ids: list[str] | None, auto_select_count: int
) -> None:
    """Background worker: run LinkedInCompanyScraper, update _linkedin_runs in place."""
    global _linkedin_running

    from src.scrapers.linkedin import (
        LinkedInBlocked,
        LinkedInCompanyScraper,
        LinkedInSessionExpired,
    )

    from src.db.client import get_firestore_client
    db = get_firestore_client()
    now_iso = datetime.utcnow().isoformat() + "Z"

    job_ref = None
    if db:
        job_ref = db.collection("pipeline_jobs").document(run_id)
        job_ref.set({
            "type": "linkedin_scrape",
            "status": "running",
            "started_at": now_iso,
            "completed_at": None,
            "lead_ids": lead_ids,
            "result": None,
        })

    try:
        _linkedin_runs[run_id]["status"] = "running"
        scraper = LinkedInCompanyScraper(
            lead_ids=lead_ids or None,
            auto_select_count=auto_select_count,
        )
        asyncio.run(scraper.run())

        leads_processed = len(scraper.collected_leads)
        employees_found = scraper.employee_count_total

        _linkedin_runs[run_id].update(
            status="completed",
            completed_at=datetime.now(),
            leads_processed=leads_processed,
            employees_found=employees_found,
        )
        log.info(
            "linkedin_run_done",
            run_id=run_id,
            leads=leads_processed,
            employees=employees_found,
        )

        completed_iso = datetime.utcnow().isoformat() + "Z"
        result_payload = {"leads_processed": leads_processed, "employees_found": employees_found}

        # Empty-result alarm: flag leads that have a LinkedIn URL but yielded zero employees
        if db and employees_found == 0 and leads_processed > 0:
            log.warning("linkedin_empty_result", run_id=run_id, leads=leads_processed)
            db.collection("pipeline_jobs").document(run_id + "_alarm").set({
                "type": "linkedin_empty_result_alarm",
                "run_id": run_id,
                "lead_ids": lead_ids,
                "leads_processed": leads_processed,
                "created_at": completed_iso,
                "resolved": False,
            })

        if job_ref:
            job_ref.update({
                "status": "completed",
                "completed_at": completed_iso,
                "result": result_payload,
            })

    except LinkedInSessionExpired as exc:
        error_msg = f"Session expired: {exc}"
        completed_iso = datetime.utcnow().isoformat() + "Z"
        _linkedin_runs[run_id].update(
            status="failed",
            error=error_msg,
            completed_at=datetime.now(),
        )
        log.error("linkedin_session_expired", run_id=run_id)
        if job_ref:
            job_ref.update({"status": "failed", "completed_at": completed_iso, "result": {"error": error_msg}})
        _send_linkedin_alert(
            subject="[Asterley Bros] LinkedIn session expired — re-auth required",
            body=(
                f"The LinkedIn scraper session has expired and all subsequent runs will fail "
                f"until someone VNCs into the VPS and re-runs:\n\n"
                f"  python -m src.scrapers.linkedin --save-session\n\n"
                f"Run ID: {run_id}\nTime: {completed_iso}"
            ),
        )
    except LinkedInBlocked as exc:
        error_msg = f"LinkedIn blocked: {exc}"
        completed_iso = datetime.utcnow().isoformat() + "Z"
        _linkedin_runs[run_id].update(
            status="failed",
            error=error_msg,
            completed_at=datetime.now(),
        )
        log.error("linkedin_blocked", run_id=run_id, error=str(exc))
        if job_ref:
            job_ref.update({"status": "failed", "completed_at": completed_iso, "result": {"error": error_msg}})
    except Exception as exc:
        error_msg = str(exc)
        completed_iso = datetime.utcnow().isoformat() + "Z"
        _linkedin_runs[run_id].update(
            status="failed",
            error=error_msg,
            completed_at=datetime.now(),
        )
        log.exception("linkedin_thread_failed", run_id=run_id)
        if job_ref:
            job_ref.update({"status": "failed", "completed_at": completed_iso, "result": {"error": error_msg}})
    finally:
        with _linkedin_lock:
            _linkedin_running = False


@router.post("/linkedin-scrape", response_model=LinkedInScrapeStatusResponse)
async def start_linkedin_scrape(
    req: LinkedInScrapeRequest,
) -> LinkedInScrapeStatusResponse:
    global _linkedin_running

    with _linkedin_lock:
        if _linkedin_running:
            raise HTTPException(
                status_code=409,
                detail="A LinkedIn scrape is already in progress",
            )
        _linkedin_running = True

    run_id = str(uuid4())
    now = datetime.now()
    _linkedin_runs[run_id] = {
        "status": "pending",
        "leads_processed": 0,
        "employees_found": 0,
        "decision_makers": 0,
        "error": None,
        "started_at": now,
        "completed_at": None,
        "current_lead": None,
    }

    thread = threading.Thread(
        target=_run_linkedin_scrape,
        args=(run_id, req.lead_ids, req.auto_select_count),
        daemon=True,
    )
    thread.start()

    return LinkedInScrapeStatusResponse(run_id=run_id, status="pending", started_at=now)


@router.get(
    "/linkedin-scrape-status/{run_id}",
    response_model=LinkedInScrapeStatusResponse,
)
async def linkedin_scrape_status(run_id: str) -> LinkedInScrapeStatusResponse:
    run = _linkedin_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return LinkedInScrapeStatusResponse(run_id=run_id, **run)


@router.get(
    "/leads/{lead_id}/linkedin-employees",
    response_model=list[LinkedInEmployeeResponse],
)
async def list_linkedin_employees(lead_id: str) -> list[LinkedInEmployeeResponse]:
    from src.db.firestore import get_linkedin_employees_for_lead

    docs = get_linkedin_employees_for_lead(lead_id)
    return [
        LinkedInEmployeeResponse(
            id=str(doc.get("id", "")),
            lead_id=str(doc.get("lead_id", "")),
            name=doc.get("name", ""),
            profile_url=doc.get("profile_url", ""),
            profile_slug=doc.get("profile_slug", ""),
            profile_image_url=doc.get("profile_image_url"),
            title=doc.get("title"),
            role_seniority=doc.get("role_seniority"),
            is_decision_maker=bool(doc.get("is_decision_maker", False)),
            location=doc.get("location"),
            connection_degree=doc.get("connection_degree"),
            confidence=doc.get("confidence", "high"),
            scraped_at=doc.get("scraped_at"),
            last_seen_at=doc.get("last_seen_at"),
            promoted_to_outreach=bool(doc.get("promoted_to_outreach", False)),
            notes=doc.get("notes"),
        )
        for doc in docs
    ]


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


# ---------------------------------------------------------------------------
# Scrape run history
# ---------------------------------------------------------------------------


@router.get("/scrape-runs")
async def get_scrape_runs():
    """Return the most recent scrape runs for the dashboard."""
    from src.db.firestore import get_scrape_runs as get_runs

    return get_runs(limit=10)


# ---------------------------------------------------------------------------
# Search query management
# ---------------------------------------------------------------------------


@router.get("/search-queries")
async def get_search_queries():
    """Return current search queries per source, with Firestore overrides."""
    from src.db.firestore import get_config as get_fs_config

    config = load_config()

    # Firestore overrides take precedence
    fs_queries = get_fs_config("search_queries")
    if fs_queries:
        return fs_queries

    # Fall back to YAML defaults
    return {
        "google_maps": config.scraping.google_maps.search_queries,
        "google_search": config.scraping.google_search.search_queries,
        "bing_search": config.scraping.bing_search.search_queries,
        "directory": config.scraping.directory.category_urls,
    }


@router.put("/search-queries")
async def update_search_queries(queries: dict):
    """Save search query overrides to Firestore."""
    from src.db.firestore import save_config as save_fs_config

    save_fs_config("search_queries", queries)
    return {"status": "updated", "queries": queries}


@router.post("/search-queries/import")
async def import_search_queries(payload: dict):
    """Import queries from a list, merge into existing queries for a source."""
    from src.db.firestore import get_config as get_fs_config
    from src.db.firestore import save_config as save_fs_config

    source = payload.get("source", "google_maps")
    new_queries = payload.get("queries", [])

    if not new_queries:
        raise HTTPException(status_code=400, detail="No queries provided")

    # Load current queries
    config = load_config()
    fs_queries = get_fs_config("search_queries")
    if not fs_queries:
        fs_queries = {
            "google_maps": config.scraping.google_maps.search_queries,
            "google_search": config.scraping.google_search.search_queries,
            "bing_search": config.scraping.bing_search.search_queries,
            "directory": config.scraping.directory.category_urls,
        }

    # Merge — deduplicate
    existing = set(fs_queries.get(source, []))
    for q in new_queries:
        q = q.strip()
        if q:
            existing.add(q)
    fs_queries[source] = sorted(existing)

    save_fs_config("search_queries", fs_queries)
    return {"status": "imported", "source": source, "total": len(fs_queries[source])}


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
