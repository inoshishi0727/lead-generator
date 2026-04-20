"""Firestore CRUD operations for leads, scrape runs, and activity logs.

All functions are safe to call when Firestore is unavailable — they return
empty results / 0 and log a warning instead of raising.
"""

from __future__ import annotations

from typing import Optional

import structlog

from google.cloud.firestore_v1.base_query import FieldFilter

from src.db.client import get_firestore_client
from src.db.models import ActivityLog, Lead, LinkedInEmployee, ScrapeRun

log = structlog.get_logger()


def _dedup_key(lead: Lead) -> str:
    """Generate a composite dedup key from source, name, and address/website."""
    from src.db.dedup import build_dedup_key
    return build_dedup_key(
        lead.source.value,
        lead.business_name,
        lead.website or lead.address,
    )


def get_known_dedup_keys(source: str = "google_maps") -> set[str]:
    """Return all existing dedup keys for a given source.

    Returns an empty set if Firestore is unavailable.
    """
    db = get_firestore_client()
    if db is None:
        return set()

    try:
        query = db.collection("leads").where(filter=FieldFilter("source", "==", source))
        keys: set[str] = set()
        for doc in query.stream():
            data = doc.to_dict()
            if "dedup_key" in data:
                keys.add(data["dedup_key"])
        log.debug("dedup_keys_loaded", source=source, count=len(keys))
        return keys
    except Exception as exc:
        log.warning("dedup_keys_failed", error=str(exc))
        return set()


def save_lead_immediate(lead: Lead) -> bool:
    """Atomically check-and-insert a single lead. Returns True if inserted.

    Used by parallel scrapers to save each lead the moment it's extracted,
    preventing duplicates across concurrent workers.
    """
    from src.db import cache

    db = get_firestore_client()
    if db is None:
        log.debug("save_lead_immediate_skipped_no_firestore", lead=lead.business_name)
        return False

    try:
        from src.db.dedup import build_universal_key

        key = _dedup_key(lead)
        universal = build_universal_key(
            lead.business_name,
            lead.website or lead.address,
        )
        collection = db.collection("leads")

        # Check by exact dedup key (same source)
        existing = collection.where(filter=FieldFilter("dedup_key", "==", key)).limit(1).get()
        if existing:
            log.debug("lead_already_exists", business_name=lead.business_name, key=key)
            return False

        # Check by universal key (cross-source: same name already in any source)
        name_lower = lead.business_name.strip().lower()
        name_matches = collection.where(
            filter=FieldFilter("business_name_lower", "==", name_lower)
        ).limit(1).get()
        if name_matches:
            log.debug("lead_exists_other_source", business_name=lead.business_name)
            return False

        doc_ref = collection.document(str(lead.id))
        doc_data = lead.model_dump(mode="json")
        doc_data["dedup_key"] = key
        doc_data["universal_dedup_key"] = universal
        doc_data["business_name_lower"] = name_lower
        doc_ref.set(doc_data)
        cache.invalidate("leads:")
        log.info("lead_saved_immediate", business_name=lead.business_name)
        return True
    except Exception as exc:
        log.warning("save_lead_immediate_failed", lead=lead.business_name, error=str(exc))
        return False


def save_leads(leads: list[Lead]) -> int:
    """Batch-write leads to Firestore, skipping duplicates.

    Returns the number of newly inserted leads, or 0 if Firestore is unavailable.
    """
    if not leads:
        return 0

    db = get_firestore_client()
    if db is None:
        log.debug("save_leads_skipped_no_firestore", count=len(leads))
        return 0

    try:
        from src.db.dedup import build_universal_key

        collection = db.collection("leads")
        inserted = 0

        # Build sets of existing keys — both source-specific and universal (name-based)
        existing_keys: set[str] = set()
        existing_names: set[str] = set()
        for doc in collection.stream():
            data = doc.to_dict()
            if "dedup_key" in data:
                existing_keys.add(data["dedup_key"])
            name = data.get("business_name", "")
            if name:
                existing_names.add(name.strip().lower())

        batch = db.batch()
        batch_count = 0

        for lead in leads:
            key = _dedup_key(lead)
            name_lower = lead.business_name.strip().lower()
            universal = build_universal_key(
                lead.business_name,
                lead.website or lead.address,
            )

            if key in existing_keys:
                log.debug("lead_dedup_skip", business_name=lead.business_name)
                continue
            if name_lower in existing_names:
                log.debug("lead_dedup_skip_cross_source", business_name=lead.business_name)
                continue

            doc_ref = collection.document(str(lead.id))
            doc_data = lead.model_dump(mode="json")
            doc_data["dedup_key"] = key
            doc_data["universal_dedup_key"] = universal
            doc_data["business_name_lower"] = name_lower
            batch.set(doc_ref, doc_data)
            existing_keys.add(key)
            existing_names.add(name_lower)
            inserted += 1
            batch_count += 1

            # Firestore batch limit is 500
            if batch_count >= 499:
                batch.commit()
                batch = db.batch()
                batch_count = 0

        if batch_count > 0:
            batch.commit()

        log.info("leads_saved", total=len(leads), inserted=inserted)
        return inserted
    except Exception as exc:
        log.warning("save_leads_failed", error=str(exc))
        return 0


def get_leads(
    source: Optional[str] = None,
    stage: Optional[str] = None,
    search: Optional[str] = None,
) -> list[dict]:
    """Query leads from Firestore with optional filters. Cached for 60s.

    Returns an empty list if Firestore is unavailable.
    """
    from src.db import cache

    cache_key = f"leads:{source or ''}:{stage or ''}:{search or ''}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    db = get_firestore_client()
    if db is None:
        return []

    try:
        query = db.collection("leads")

        if source and source != "All":
            source_val = "google_maps" if source == "Google Maps" else source.lower()
            query = query.where(filter=FieldFilter("source", "==", source_val))

        if stage and stage != "All":
            query = query.where(filter=FieldFilter("stage", "==", stage))

        results = []
        for doc in query.stream():
            data = doc.to_dict()
            if search:
                name = (data.get("business_name") or "").lower()
                if search.lower() not in name:
                    continue
            results.append(data)

        cache.set(cache_key, results, ttl=60)
        return results
    except Exception as exc:
        log.warning("get_leads_failed", error=str(exc))
        return []


def save_scrape_run(run: ScrapeRun) -> None:
    """Write a single scrape run document."""
    db = get_firestore_client()
    if db is None:
        return

    try:
        doc_ref = db.collection("scrape_runs").document(str(run.id))
        doc_ref.set(run.model_dump(mode="json"))
        log.info("scrape_run_saved", run_id=str(run.id))
    except Exception as exc:
        log.warning("save_scrape_run_failed", error=str(exc))


def update_scrape_run(run_id: str, updates: dict) -> None:
    """Partially update a scrape run document."""
    db = get_firestore_client()
    if db is None:
        return

    try:
        doc_ref = db.collection("scrape_runs").document(run_id)
        doc_ref.update(updates)
        log.info("scrape_run_updated", run_id=run_id)
    except Exception as exc:
        log.warning("update_scrape_run_failed", error=str(exc))


def get_scrape_runs(limit: int = 10) -> list[dict]:
    """Return the most recent scrape runs, ordered by started_at descending."""
    db = get_firestore_client()
    if db is None:
        return []

    try:
        query = (
            db.collection("scrape_runs")
            .order_by("started_at", direction="DESCENDING")
            .limit(limit)
        )
        return [doc.to_dict() for doc in query.stream()]
    except Exception as exc:
        log.warning("get_scrape_runs_failed", error=str(exc))
        return []


def update_lead(lead_id: str, updates: dict) -> bool:
    """Partially update a lead document in Firestore."""
    from src.db import cache

    db = get_firestore_client()
    if db is None:
        return False

    try:
        doc_ref = db.collection("leads").document(lead_id)
        doc_ref.update(updates)
        cache.invalidate("leads:")
        log.debug("lead_updated", lead_id=lead_id)
        return True
    except Exception as exc:
        log.warning("update_lead_failed", lead_id=lead_id, error=str(exc))
        return False


def get_lead_by_id(lead_id: str) -> dict | None:
    """Fetch a single lead document by ID."""
    db = get_firestore_client()
    if db is None:
        return None

    try:
        doc = db.collection("leads").document(lead_id).get()
        if doc.exists:
            return doc.to_dict()
        return None
    except Exception as exc:
        log.warning("get_lead_by_id_failed", lead_id=lead_id, error=str(exc))
        return None


def get_leads_by_stage(stage: str) -> list[dict]:
    """Query all leads in a given pipeline stage."""
    db = get_firestore_client()
    if db is None:
        return []

    try:
        query = db.collection("leads").where(filter=FieldFilter("stage", "==", stage))
        return [doc.to_dict() for doc in query.stream()]
    except Exception as exc:
        log.warning("get_leads_by_stage_failed", stage=stage, error=str(exc))
        return []


def save_config(key: str, data: dict) -> None:
    """Persist a config document to Firestore."""
    db = get_firestore_client()
    if db is None:
        return

    try:
        db.collection("config").document(key).set(data)
        log.info("config_saved", key=key)
    except Exception as exc:
        log.warning("save_config_failed", key=key, error=str(exc))


def get_config(key: str) -> dict | None:
    """Load a config document from Firestore."""
    db = get_firestore_client()
    if db is None:
        return None

    try:
        doc = db.collection("config").document(key).get()
        if doc.exists:
            return doc.to_dict()
        return None
    except Exception as exc:
        log.warning("get_config_failed", key=key, error=str(exc))
        return None


def save_outreach_message(message_data: dict) -> bool:
    """Save an outreach message document to Firestore."""
    from src.db import cache

    db = get_firestore_client()
    if db is None:
        return False

    try:
        doc_id = message_data.get("id", str(__import__("uuid").uuid4()))
        db.collection("outreach_messages").document(doc_id).set(message_data)
        cache.invalidate("outreach_msgs:")
        log.debug("outreach_message_saved", id=doc_id)
        return True
    except Exception as exc:
        log.warning("save_outreach_message_failed", error=str(exc))
        return False


def get_outreach_messages(
    lead_id: str | None = None,
    status: str | None = None,
    channel: str | None = None,
) -> list[dict]:
    """Query outreach messages with optional filters. Cached for 120s."""
    from src.db import cache

    cache_key = f"outreach_msgs:{lead_id or ''}:{status or ''}:{channel or ''}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    db = get_firestore_client()
    if db is None:
        return []

    try:
        query = db.collection("outreach_messages")
        if lead_id:
            query = query.where(filter=FieldFilter("lead_id", "==", lead_id))
        if status:
            query = query.where(filter=FieldFilter("status", "==", status))
        if channel:
            query = query.where(filter=FieldFilter("channel", "==", channel))
        results = [doc.to_dict() for doc in query.stream()]
        cache.set(cache_key, results, ttl=120)
        return results
    except Exception as exc:
        log.warning("get_outreach_messages_failed", error=str(exc))
        return []


def get_outreach_message_by_id(message_id: str) -> dict | None:
    """Fetch a single outreach message by ID."""
    db = get_firestore_client()
    if db is None:
        return None

    try:
        doc = db.collection("outreach_messages").document(message_id).get()
        if doc.exists:
            return doc.to_dict()
        return None
    except Exception as exc:
        log.warning("get_outreach_message_by_id_failed", error=str(exc))
        return None


def update_outreach_message(message_id: str, updates: dict) -> bool:
    """Update an outreach message document."""
    from src.db import cache

    db = get_firestore_client()
    if db is None:
        return False

    try:
        db.collection("outreach_messages").document(message_id).update(updates)
        cache.invalidate("outreach_msgs:")
        log.debug("outreach_message_updated", id=message_id)
        return True
    except Exception as exc:
        log.warning("update_outreach_message_failed", error=str(exc))
        return False


def log_activity(
    event_type: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    details: dict | None = None,
) -> None:
    """Write an activity log event to Firestore."""
    db = get_firestore_client()
    if db is None:
        return

    try:
        entry = ActivityLog(
            event_type=event_type,
            entity_type=entity_type,
            details=details,
        )
        if entity_id:
            import uuid
            entry.entity_id = uuid.UUID(entity_id)

        doc_ref = db.collection("activity_log").document(str(entry.id))
        doc_ref.set(entry.model_dump(mode="json"))
        log.debug("activity_logged", event_type=event_type)
    except Exception as exc:
        log.warning("log_activity_failed", error=str(exc))


def save_edit_feedback(feedback: dict) -> bool:
    """Save an edit feedback record with diff to the edit_feedback collection."""
    db = get_firestore_client()
    if db is None:
        return False

    try:
        doc_ref = db.collection("edit_feedback").document()
        doc_ref.set(feedback)
        log.info("edit_feedback_saved", message_id=feedback.get("message_id"))
        return True
    except Exception as exc:
        log.warning("save_edit_feedback_failed", error=str(exc))
        return False


def _linkedin_employee_doc_id(lead_id: str, profile_slug: str) -> str:
    return f"{lead_id}_{profile_slug}"


def save_linkedin_employee(employee: LinkedInEmployee) -> bool:
    """Upsert a LinkedIn employee keyed by (lead_id, profile_slug).

    Same person re-scraped for the same lead updates last_seen_at in place.
    Same person at a different lead becomes a new document (job history preserved).
    """
    db = get_firestore_client()
    if db is None:
        return False

    try:
        doc_id = _linkedin_employee_doc_id(str(employee.lead_id), employee.profile_slug)
        doc_ref = db.collection("linkedin_employees").document(doc_id)
        existing = doc_ref.get()
        payload = employee.model_dump(mode="json")

        if existing.exists:
            prev = existing.to_dict() or {}
            payload["id"] = prev.get("id", payload["id"])
            payload["scraped_at"] = prev.get("scraped_at", payload["scraped_at"])
            payload["promoted_to_outreach"] = prev.get("promoted_to_outreach", False)
            payload["promoted_at"] = prev.get("promoted_at")
            payload["notes"] = prev.get("notes") or payload.get("notes")

        doc_ref.set(payload)
        log.debug("linkedin_employee_saved", doc_id=doc_id, name=employee.name)
        return True
    except Exception as exc:
        log.warning("save_linkedin_employee_failed", name=employee.name, error=str(exc))
        return False


def get_linkedin_employees_for_lead(lead_id: str) -> list[dict]:
    """Return all LinkedIn employees scraped for a given lead."""
    db = get_firestore_client()
    if db is None:
        return []

    try:
        query = db.collection("linkedin_employees").where(
            filter=FieldFilter("lead_id", "==", lead_id)
        )
        return [doc.to_dict() for doc in query.stream()]
    except Exception as exc:
        log.warning("get_linkedin_employees_failed", lead_id=lead_id, error=str(exc))
        return []


def update_lead_linkedin_status(lead_id: str, status: str, **extra: object) -> bool:
    """Set linkedin_scrape_status plus any additional LinkedIn fields on a lead."""
    updates: dict = {"linkedin_scrape_status": status}
    updates.update(extra)
    return update_lead(lead_id, updates)


def count_linkedin_scrapes_today() -> int:
    """Count LinkedIn scrape completions in the last 24h (for per-day cap)."""
    db = get_firestore_client()
    if db is None:
        return 0

    try:
        from datetime import timedelta
        from datetime import datetime as _dt

        cutoff = (_dt.now() - timedelta(hours=24)).isoformat()
        query = (
            db.collection("activity_log")
            .where(filter=FieldFilter("event_type", "==", "linkedin_company_scraped"))
            .where(filter=FieldFilter("created_at", ">=", cutoff))
        )
        return sum(1 for _ in query.stream())
    except Exception as exc:
        log.warning("count_linkedin_scrapes_today_failed", error=str(exc))
        return 0


def get_leads_needing_linkedin_scrape(limit: int, rescrape_after_days: int = 90) -> list[dict]:
    """Return leads that should be LinkedIn-scraped: never scraped, or scraped > N days ago.

    Ordered by score desc (highest-value first). Used by --auto-select-count.
    """
    db = get_firestore_client()
    if db is None:
        return []

    try:
        from datetime import datetime as _dt, timedelta

        cutoff = (_dt.now() - timedelta(days=rescrape_after_days)).isoformat()
        query = (
            db.collection("leads")
            .order_by("score", direction="DESCENDING")
            .limit(limit * 3)
        )
        eligible: list[dict] = []
        for doc in query.stream():
            data = doc.to_dict()
            scraped = data.get("linkedin_scraped_at")
            if scraped and scraped >= cutoff:
                continue
            eligible.append(data)
            if len(eligible) >= limit:
                break
        return eligible
    except Exception as exc:
        log.warning("get_leads_needing_linkedin_scrape_failed", error=str(exc))
        return []


def get_all_leads_needing_linkedin_scrape(rescrape_after_days: int = 90) -> list[dict]:
    """Return every lead that hasn't been LinkedIn-scraped (or is past its cutoff).

    Unlike get_leads_needing_linkedin_scrape, there is no limit — used by the
    bulk --all backfill CLI mode. Ordered by score desc so if the backfill
    is interrupted, the highest-value leads are already done.
    """
    db = get_firestore_client()
    if db is None:
        return []

    try:
        from datetime import datetime as _dt, timedelta

        cutoff = (_dt.now() - timedelta(days=rescrape_after_days)).isoformat()
        query = db.collection("leads").order_by("score", direction="DESCENDING")
        eligible: list[dict] = []
        for doc in query.stream():
            data = doc.to_dict()
            scraped = data.get("linkedin_scraped_at")
            if scraped and scraped >= cutoff:
                continue
            eligible.append(data)
        return eligible
    except Exception as exc:
        log.warning("get_all_leads_needing_linkedin_scrape_failed", error=str(exc))
        return []
