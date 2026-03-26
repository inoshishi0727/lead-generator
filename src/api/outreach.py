"""Outreach API router — draft generation, approval, and message management."""

from __future__ import annotations

import asyncio
import threading
from datetime import datetime
from uuid import uuid4

import structlog
from fastapi import APIRouter, HTTPException

from src.api.schemas import (
    BatchApproveRequest,
    GenerateDraftsRequest,
    GenerateDraftsStatusResponse,
    GenerateFollowupsStatusResponse,
    OutreachMessageResponse,
    SendRequest,
    SendStatusResponse,
    UpdateMessageRequest,
)
from src.config.loader import load_config

log = structlog.get_logger()

outreach_router = APIRouter(prefix="/api/outreach")

_generate_runs: dict[str, dict] = {}
_send_runs: dict[str, dict] = {}
_followup_runs: dict[str, dict] = {}


def _has_enrichment(doc: dict) -> bool:
    """Check if a lead has enough enrichment data for a quality email."""
    enrichment = doc.get("enrichment") or {}
    # Need at least context_notes or drinks_programme for personalisation
    has_context = bool(enrichment.get("context_notes"))
    has_drinks = bool(enrichment.get("drinks_programme"))
    has_summary = bool(enrichment.get("business_summary"))
    has_category = bool(enrichment.get("venue_category"))
    return has_category and (has_context or has_drinks or has_summary)


def _is_optimal_send_window() -> bool:
    """Check if current time is within optimal sending window (Tue-Thu, 10am-1pm)."""
    now = datetime.now()
    # Tuesday=1, Wednesday=2, Thursday=3 (Monday=0)
    if now.weekday() not in (1, 2, 3):
        return False
    if not (10 <= now.hour < 13):
        return False
    return True


def _message_to_response(msg: dict, lead_doc: dict | None = None) -> OutreachMessageResponse:
    """Convert a Firestore message doc + optional lead doc to response."""
    enrichment = {}
    contact_name = None
    if lead_doc:
        enrichment = lead_doc.get("enrichment") or {}
        contact = enrichment.get("contact") or {}
        contact_name = contact.get("name")

    return OutreachMessageResponse(
        id=msg.get("id", ""),
        lead_id=msg.get("lead_id", ""),
        business_name=lead_doc.get("business_name", "") if lead_doc else msg.get("business_name", ""),
        venue_category=enrichment.get("venue_category") if lead_doc else msg.get("venue_category"),
        channel=msg.get("channel", "email"),
        subject=msg.get("subject"),
        content=msg.get("content", ""),
        status=msg.get("status", "draft"),
        step_number=msg.get("step_number", 1),
        created_at=msg.get("created_at"),
        tone_tier=enrichment.get("tone_tier") if lead_doc else msg.get("tone_tier"),
        lead_products=enrichment.get("lead_products", []) if lead_doc else msg.get("lead_products", []),
        contact_name=contact_name or msg.get("contact_name"),
        context_notes=enrichment.get("context_notes") if lead_doc else msg.get("context_notes"),
        menu_fit=enrichment.get("menu_fit") if lead_doc else msg.get("menu_fit"),
    )


def _run_draft_generation(run_id: str, lead_ids: list[str] | None) -> None:
    """Generate outreach drafts in a background thread."""
    try:
        _generate_runs[run_id]["status"] = "running"

        from src.db.firestore import (
            get_lead_by_id,
            get_leads_by_stage,
            save_outreach_message,
            update_lead,
        )
        from src.db.models import (
            EnrichmentData,
            Lead,
            LeadSource,
            OutreachChannel,
        )
        from src.outreach.drafts import DraftGenerator

        # Get leads to generate drafts for — any lead with an email that doesn't
        # already have a draft. Works regardless of pipeline stage.
        if lead_ids:
            docs = [get_lead_by_id(lid) for lid in lead_ids]
            docs = [d for d in docs if d]
        else:
            from src.db.firestore import get_leads, get_outreach_messages
            all_docs = get_leads()
            # Filter: must have email, must not already have a draft
            existing_messages = get_outreach_messages()
            leads_with_drafts = {m.get("lead_id") for m in existing_messages}
            docs = [
                d for d in all_docs
                if d.get("email")
                and d.get("id") not in leads_with_drafts
                and _has_enrichment(d)
            ]

        _generate_runs[run_id]["total"] = len(docs)

        config = load_config()
        generator = DraftGenerator(config=config)
        generated = 0
        failed = 0

        for doc in docs:
            try:
                # Reconstruct Lead model
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

                # Determine channel
                channel = (
                    OutreachChannel.INSTAGRAM_DM
                    if lead.source.value == "instagram" and not lead.email
                    else OutreachChannel.EMAIL
                )

                # Generate draft
                message = generator.generate_draft(lead, channel)

                # Extract enrichment context for the message doc
                enrichment = doc.get("enrichment") or {}
                contact = enrichment.get("contact") or {}

                # Save to Firestore
                msg_data = {
                    "id": str(message.id),
                    "lead_id": str(lead.id),
                    "business_name": lead.business_name,
                    "venue_category": enrichment.get("venue_category"),
                    "channel": message.channel.value,
                    "subject": message.subject,
                    "content": message.content,
                    "status": "draft",
                    "step_number": 1,
                    "created_at": message.created_at.isoformat(),
                    "tone_tier": enrichment.get("tone_tier"),
                    "lead_products": enrichment.get("lead_products", []),
                    "contact_name": contact.get("name"),
                    "context_notes": enrichment.get("context_notes"),
                    "menu_fit": enrichment.get("menu_fit"),
                }
                save_outreach_message(msg_data)

                # Update lead stage
                update_lead(str(lead.id), {"stage": "draft_generated"})

                generated += 1
                _generate_runs[run_id]["generated"] = generated
                log.info("draft_generated", lead=lead.business_name, channel=channel.value)

                # Notify frontend every 5 drafts
                if generated % 5 == 0:
                    from src.events import emit
                    emit("drafts_generated", generated=generated, total=len(docs))

            except Exception as exc:
                failed += 1
                _generate_runs[run_id]["failed"] = failed
                log.warning("draft_generation_failed", lead=doc.get("business_name"), error=str(exc))

        _generate_runs[run_id].update(
            status="completed",
            generated=generated,
            failed=failed,
            completed_at=datetime.now().isoformat(),
        )
        from src.events import emit
        emit("drafts_generated", generated=generated, total=len(docs), status="completed")
        log.info("draft_generation_done", run_id=run_id, generated=generated, failed=failed)

    except Exception as exc:
        _generate_runs[run_id].update(status="failed", error=str(exc))
        log.exception("draft_generation_thread_failed", run_id=run_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@outreach_router.post("/generate", response_model=GenerateDraftsStatusResponse)
async def generate_drafts(req: GenerateDraftsRequest) -> GenerateDraftsStatusResponse:
    run_id = str(uuid4())
    _generate_runs[run_id] = {"status": "pending", "total": 0, "generated": 0, "failed": 0}

    thread = threading.Thread(
        target=_run_draft_generation,
        args=(run_id, req.lead_ids),
        daemon=True,
    )
    thread.start()

    return GenerateDraftsStatusResponse(run_id=run_id, status="pending")


@outreach_router.get("/generate-status/{run_id}", response_model=GenerateDraftsStatusResponse)
async def generate_status(run_id: str) -> GenerateDraftsStatusResponse:
    run = _generate_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Generation run not found")
    return GenerateDraftsStatusResponse(run_id=run_id, **run)


@outreach_router.get("/messages", response_model=list[OutreachMessageResponse])
async def list_messages(
    status: str | None = None,
    channel: str | None = None,
    lead_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[OutreachMessageResponse]:
    from src.db.firestore import get_lead_by_id, get_outreach_messages

    msgs = get_outreach_messages(lead_id=lead_id, status=status, channel=channel)

    # Sort by created_at desc, then paginate
    msgs.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    page = msgs[offset:offset + limit]

    # Build lead cache from the cached leads list (avoids N individual Firestore reads)
    from src.db.firestore import get_leads
    all_leads = get_leads()
    lead_cache: dict[str, dict] = {l.get("id", ""): l for l in all_leads}

    results = []
    for msg in page:
        lid = msg.get("lead_id", "")
        lead_doc = lead_cache.get(lid)
        if lid and not lead_doc:
            lead_doc = get_lead_by_id(lid)
        results.append(_message_to_response(msg, lead_doc))

    return results


@outreach_router.get("/messages/{message_id}", response_model=OutreachMessageResponse)
async def get_message(message_id: str) -> OutreachMessageResponse:
    from src.db.firestore import get_lead_by_id, get_outreach_message_by_id

    msg = get_outreach_message_by_id(message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    lead_doc = None
    if msg.get("lead_id"):
        lead_doc = get_lead_by_id(msg["lead_id"])

    return _message_to_response(msg, lead_doc)


@outreach_router.patch("/messages/{message_id}", response_model=OutreachMessageResponse)
async def update_message(message_id: str, req: UpdateMessageRequest) -> OutreachMessageResponse:
    from src.db.firestore import (
        get_lead_by_id,
        get_outreach_message_by_id,
        update_lead,
        update_outreach_message,
    )

    msg = get_outreach_message_by_id(message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    updates: dict = {}
    if req.content is not None:
        updates["content"] = req.content
    if req.subject is not None:
        updates["subject"] = req.subject
    if req.status is not None:
        updates["status"] = req.status
        # Advance lead stage on approval
        if req.status == "approved" and msg.get("lead_id"):
            update_lead(msg["lead_id"], {"stage": "approved"})
        elif req.status == "rejected" and msg.get("lead_id"):
            update_lead(msg["lead_id"], {"stage": "draft_generated"})

    if updates:
        update_outreach_message(message_id, updates)
        msg.update(updates)
        from src.events import emit
        emit("drafts_generated", action="updated")

    lead_doc = None
    if msg.get("lead_id"):
        lead_doc = get_lead_by_id(msg["lead_id"])

    return _message_to_response(msg, lead_doc)


@outreach_router.post("/messages/{message_id}/regenerate", response_model=OutreachMessageResponse)
async def regenerate_message(message_id: str) -> OutreachMessageResponse:
    from src.db.firestore import (
        get_lead_by_id,
        get_outreach_message_by_id,
        update_outreach_message,
    )
    from src.db.models import EnrichmentData, Lead, LeadSource, OutreachChannel
    from src.outreach.drafts import DraftGenerator

    msg = get_outreach_message_by_id(message_id)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    lead_doc = get_lead_by_id(msg["lead_id"]) if msg.get("lead_id") else None
    if not lead_doc:
        raise HTTPException(status_code=404, detail="Lead not found for this message")

    # Reconstruct lead
    enrichment_data = None
    if lead_doc.get("enrichment"):
        enrichment_data = EnrichmentData(**lead_doc["enrichment"])

    lead = Lead(
        id=lead_doc.get("id"),
        source=LeadSource(lead_doc["source"]),
        business_name=lead_doc["business_name"],
        address=lead_doc.get("address"),
        phone=lead_doc.get("phone"),
        website=lead_doc.get("website"),
        email=lead_doc.get("email"),
        email_found=lead_doc.get("email_found", False),
        rating=lead_doc.get("rating"),
        review_count=lead_doc.get("review_count"),
        category=lead_doc.get("category"),
        instagram_handle=lead_doc.get("instagram_handle"),
        instagram_followers=lead_doc.get("instagram_followers"),
        enrichment=enrichment_data,
    )

    channel = OutreachChannel(msg.get("channel", "email"))
    config = load_config()
    generator = DraftGenerator(config=config)
    new_message = generator.generate_draft(lead, channel)

    updates = {
        "content": new_message.content,
        "subject": new_message.subject,
        "status": "draft",
        "created_at": datetime.now().isoformat(),
    }
    update_outreach_message(message_id, updates)
    msg.update(updates)

    return _message_to_response(msg, lead_doc)


@outreach_router.post("/approve-batch")
async def approve_batch(req: BatchApproveRequest):
    from src.db.firestore import (
        get_outreach_message_by_id,
        update_lead,
        update_outreach_message,
    )

    approved = 0
    for mid in req.message_ids:
        msg = get_outreach_message_by_id(mid)
        if msg and msg.get("status") == "draft":
            update_outreach_message(mid, {"status": "approved"})
            if msg.get("lead_id"):
                update_lead(msg["lead_id"], {"stage": "approved"})
            approved += 1

    return {"approved": approved, "total": len(req.message_ids)}


# ---------------------------------------------------------------------------
# Regenerate all drafts
# ---------------------------------------------------------------------------


def _run_regenerate_all(run_id: str) -> None:
    """Delete all existing drafts and regenerate from scratch."""
    try:
        _generate_runs[run_id]["status"] = "running"

        from src.db.firestore import (
            get_leads,
            get_outreach_messages,
            save_outreach_message,
            update_lead,
            update_outreach_message,
        )
        from src.db.models import (
            EnrichmentData,
            Lead,
            LeadSource,
            OutreachChannel,
        )
        from src.outreach.drafts import DraftGenerator

        # Delete all existing draft messages
        existing_messages = get_outreach_messages()
        for msg in existing_messages:
            if msg.get("status") == "draft":
                update_outreach_message(msg["id"], {"status": "rejected"})

        # Get all leads with email and enrichment
        all_docs = get_leads()
        docs = [
            d for d in all_docs
            if d.get("email") and _has_enrichment(d)
        ]

        _generate_runs[run_id]["total"] = len(docs)

        config = load_config()
        generator = DraftGenerator(config=config)
        generated = 0
        failed = 0

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

                channel = (
                    OutreachChannel.INSTAGRAM_DM
                    if lead.source.value == "instagram" and not lead.email
                    else OutreachChannel.EMAIL
                )

                message = generator.generate_draft(lead, channel)

                enrichment = doc.get("enrichment") or {}
                contact = enrichment.get("contact") or {}

                msg_data = {
                    "id": str(message.id),
                    "lead_id": str(lead.id),
                    "business_name": lead.business_name,
                    "venue_category": enrichment.get("venue_category"),
                    "channel": message.channel.value,
                    "subject": message.subject,
                    "content": message.content,
                    "status": "draft",
                    "step_number": 1,
                    "created_at": message.created_at.isoformat(),
                    "tone_tier": enrichment.get("tone_tier"),
                    "lead_products": enrichment.get("lead_products", []),
                    "contact_name": contact.get("name"),
                    "context_notes": enrichment.get("context_notes"),
                    "menu_fit": enrichment.get("menu_fit"),
                }
                save_outreach_message(msg_data)
                update_lead(str(lead.id), {"stage": "draft_generated"})

                generated += 1
                _generate_runs[run_id]["generated"] = generated

                if generated % 5 == 0:
                    from src.events import emit
                    emit("drafts_generated", generated=generated, total=len(docs))

                log.info("regenerated_draft", lead=lead.business_name)

            except Exception as exc:
                failed += 1
                _generate_runs[run_id]["failed"] = failed
                log.warning("regenerate_failed", lead=doc.get("business_name"), error=str(exc))

        _generate_runs[run_id].update(
            status="completed",
            generated=generated,
            failed=failed,
            completed_at=datetime.now().isoformat(),
        )
        from src.events import emit
        emit("drafts_generated", generated=generated, status="completed")
        log.info("regenerate_all_done", run_id=run_id, generated=generated, failed=failed)

    except Exception as exc:
        _generate_runs[run_id].update(status="failed", error=str(exc))
        log.exception("regenerate_all_thread_failed", run_id=run_id)


@outreach_router.post("/regenerate-all", response_model=GenerateDraftsStatusResponse)
async def regenerate_all_drafts() -> GenerateDraftsStatusResponse:
    """Delete all existing drafts and regenerate from scratch."""
    run_id = str(uuid4())
    _generate_runs[run_id] = {"status": "pending", "total": 0, "generated": 0, "failed": 0}

    thread = threading.Thread(
        target=_run_regenerate_all,
        args=(run_id,),
        daemon=True,
    )
    thread.start()

    return GenerateDraftsStatusResponse(run_id=run_id, status="pending")


# ---------------------------------------------------------------------------
# Send approved emails
# ---------------------------------------------------------------------------


def _run_send_approved(run_id: str) -> None:
    """Send all approved emails in a background thread."""
    try:
        _send_runs[run_id]["status"] = "running"

        from src.db.firestore import (
            get_lead_by_id,
            get_outreach_messages,
            update_lead,
            update_outreach_message,
        )
        from src.outreach.email_sender import EmailSender

        config = load_config()
        sender = EmailSender(config=config)

        # Get all approved email messages
        msgs = get_outreach_messages(status="approved", channel="email")
        _send_runs[run_id]["total"] = len(msgs)

        sent = 0
        failed = 0

        for msg in msgs:
            try:
                lead_doc = get_lead_by_id(msg["lead_id"]) if msg.get("lead_id") else None
                to_email = None
                if lead_doc:
                    to_email = lead_doc.get("contact_email") or lead_doc.get("email")
                if not to_email:
                    log.warning("send_skip_no_email", lead_id=msg.get("lead_id"))
                    failed += 1
                    _send_runs[run_id]["failed"] = failed
                    continue

                # Build a minimal OutreachMessage for the sender
                from src.db.models import MessageStatus, OutreachChannel, OutreachMessage

                message = OutreachMessage(
                    id=msg["id"],
                    lead_id=msg["lead_id"],
                    channel=OutreachChannel(msg.get("channel", "email")),
                    subject=msg.get("subject"),
                    content=msg["content"],
                    status=MessageStatus.APPROVED,
                )

                result = sender.send_email(message, to_email)

                if result.status == MessageStatus.SENT:
                    now = datetime.now()
                    update_outreach_message(msg["id"], {
                        "status": "sent",
                        "sent_at": now.isoformat(),
                    })
                    if msg.get("lead_id"):
                        update_lead(msg["lead_id"], {"stage": "sent"})
                    sent += 1
                else:
                    update_outreach_message(msg["id"], {"status": "bounced"})
                    failed += 1

                _send_runs[run_id].update(sent=sent, failed=failed)
                log.info("email_sent_ok", lead_id=msg.get("lead_id"), to=to_email)

            except Exception as exc:
                failed += 1
                _send_runs[run_id]["failed"] = failed
                log.warning("send_failed", lead_id=msg.get("lead_id"), error=str(exc))

        _send_runs[run_id].update(
            status="completed",
            sent=sent,
            failed=failed,
            completed_at=datetime.now().isoformat(),
        )
        from src.events import emit
        emit("messages_sent", sent=sent, failed=failed, status="completed")
        log.info("send_run_done", run_id=run_id, sent=sent, failed=failed)

    except Exception as exc:
        _send_runs[run_id].update(status="failed", error=str(exc))
        log.exception("send_thread_failed", run_id=run_id)


@outreach_router.post("/send", response_model=SendStatusResponse)
async def send_approved(req: SendRequest | None = None) -> SendStatusResponse:
    """Send all approved emails via Resend."""
    force = req.force if req else False
    optimal = _is_optimal_send_window()

    if not optimal and not force:
        # Return warning but don't block
        return SendStatusResponse(
            run_id="",
            status="warning",
            outside_optimal_window=True,
        )

    run_id = str(uuid4())
    _send_runs[run_id] = {"status": "pending", "total": 0, "sent": 0, "failed": 0}

    thread = threading.Thread(
        target=_run_send_approved,
        args=(run_id,),
        daemon=True,
    )
    thread.start()

    return SendStatusResponse(
        run_id=run_id,
        status="pending",
        outside_optimal_window=not optimal,
    )


@outreach_router.get("/send-status/{run_id}", response_model=SendStatusResponse)
async def send_status(run_id: str) -> SendStatusResponse:
    run = _send_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Send run not found")
    return SendStatusResponse(run_id=run_id, **run)


# ---------------------------------------------------------------------------
# Follow-up generation
# ---------------------------------------------------------------------------


def _run_followup_generation(run_id: str) -> None:
    """Generate follow-up drafts for leads due for follow-up."""
    try:
        _followup_runs[run_id]["status"] = "running"

        from src.db.firestore import (
            get_lead_by_id,
            get_leads_by_stage,
            get_outreach_messages,
            save_outreach_message,
            update_lead,
        )
        from src.db.models import EnrichmentData, Lead, LeadSource, OutreachChannel
        from src.outreach.drafts import DraftGenerator

        config = load_config()
        generator = DraftGenerator(config=config)

        # Get leads in sent or follow_up_1 stages
        sent_docs = get_leads_by_stage("sent")
        fu1_docs = get_leads_by_stage("follow_up_1")
        all_docs = sent_docs + fu1_docs

        _followup_runs[run_id]["total"] = len(all_docs)
        generated = 0
        failed = 0

        for doc in all_docs:
            try:
                lead_id = doc.get("id")
                current_stage = doc.get("stage")

                # Determine follow-up step
                step = 2 if current_stage == "sent" else 3

                # Check timing via FollowUpManager logic
                existing_msgs = get_outreach_messages(lead_id=lead_id)
                sent_msgs = [m for m in existing_msgs if m.get("status") == "sent"]
                if not sent_msgs:
                    continue

                # Find the most recent sent message
                sent_msgs.sort(key=lambda m: m.get("sent_at", ""), reverse=True)
                last_sent = sent_msgs[0]
                sent_at_str = last_sent.get("sent_at")
                if not sent_at_str:
                    continue

                from datetime import datetime as dt
                sent_at = dt.fromisoformat(sent_at_str)
                days_since = (datetime.now() - sent_at).days

                follow_up_days = config.pipeline.follow_up_days
                if step == 2 and days_since < follow_up_days.get("first", 5):
                    continue
                if step == 3 and days_since < follow_up_days.get("second", 12):
                    continue

                # Check if follow-up draft already exists for this step
                existing_steps = {m.get("step_number", 1) for m in existing_msgs}
                if step in existing_steps:
                    continue

                # Get the original subject from step 1
                step1_msgs = [m for m in existing_msgs if m.get("step_number", 1) == 1]
                previous_subject = step1_msgs[0].get("subject", "") if step1_msgs else ""

                # Reconstruct Lead model
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

                channel = OutreachChannel.EMAIL
                message = generator.generate_followup_draft(
                    lead, channel, step=step, previous_subject=previous_subject,
                )

                enrichment = doc.get("enrichment") or {}
                contact = enrichment.get("contact") or {}

                msg_data = {
                    "id": str(message.id),
                    "lead_id": str(lead.id),
                    "business_name": lead.business_name,
                    "venue_category": enrichment.get("venue_category"),
                    "channel": message.channel.value,
                    "subject": message.subject,
                    "content": message.content,
                    "status": "draft",
                    "step_number": step,
                    "created_at": message.created_at.isoformat(),
                    "tone_tier": enrichment.get("tone_tier"),
                    "lead_products": enrichment.get("lead_products", []),
                    "contact_name": contact.get("name"),
                    "context_notes": enrichment.get("context_notes"),
                    "menu_fit": enrichment.get("menu_fit"),
                }
                save_outreach_message(msg_data)

                # Advance lead stage
                new_stage = "follow_up_1" if step == 2 else "follow_up_2"
                update_lead(str(lead.id), {"stage": new_stage})

                generated += 1
                _followup_runs[run_id]["generated"] = generated
                log.info("followup_generated", lead=lead.business_name, step=step)

            except Exception as exc:
                failed += 1
                _followup_runs[run_id]["failed"] = failed
                log.warning("followup_generation_failed", lead=doc.get("business_name"), error=str(exc))

        _followup_runs[run_id].update(
            status="completed",
            generated=generated,
            failed=failed,
            completed_at=datetime.now().isoformat(),
        )
        from src.events import emit
        emit("drafts_generated", generated=generated, status="completed")
        log.info("followup_generation_done", run_id=run_id, generated=generated, failed=failed)

    except Exception as exc:
        _followup_runs[run_id].update(status="failed", error=str(exc))
        log.exception("followup_generation_thread_failed", run_id=run_id)


@outreach_router.post("/generate-followups", response_model=GenerateFollowupsStatusResponse)
async def generate_followups() -> GenerateFollowupsStatusResponse:
    """Generate follow-up drafts for leads due for follow-up."""
    run_id = str(uuid4())
    _followup_runs[run_id] = {"status": "pending", "total": 0, "generated": 0, "failed": 0}

    thread = threading.Thread(
        target=_run_followup_generation,
        args=(run_id,),
        daemon=True,
    )
    thread.start()

    return GenerateFollowupsStatusResponse(run_id=run_id, status="pending")


@outreach_router.get("/followup-status/{run_id}", response_model=GenerateFollowupsStatusResponse)
async def followup_status(run_id: str) -> GenerateFollowupsStatusResponse:
    run = _followup_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Follow-up run not found")
    return GenerateFollowupsStatusResponse(run_id=run_id, **run)
