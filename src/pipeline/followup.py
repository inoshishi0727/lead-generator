"""Automated follow-up logic for leads that haven't responded."""

from __future__ import annotations

from datetime import datetime, timedelta

import structlog

from src.config.loader import AppConfig, load_config
from src.db.models import Lead, OutreachMessage, PipelineStage
from src.pipeline.tracker import PipelineTracker

log = structlog.get_logger()


class FollowUpManager:
    """Identifies leads due for follow-up and triggers re-drafting."""

    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or load_config()
        self.follow_up_days = self.config.pipeline.follow_up_days
        self.tracker = PipelineTracker()

    def get_leads_due_for_followup(
        self,
        leads: list[Lead],
        messages: list[OutreachMessage],
    ) -> list[tuple[Lead, int]]:
        """Return leads that are due for follow-up.

        Returns list of (lead, follow_up_number) tuples.
        """
        now = datetime.now()
        due: list[tuple[Lead, int]] = []

        # Build a lookup of last sent message per lead
        last_sent: dict[str, datetime] = {}
        for msg in messages:
            if msg.sent_at and (
                str(msg.lead_id) not in last_sent
                or msg.sent_at > last_sent[str(msg.lead_id)]
            ):
                last_sent[str(msg.lead_id)] = msg.sent_at

        for lead in leads:
            lead_id = str(lead.id)
            sent_at = last_sent.get(lead_id)
            if not sent_at:
                continue

            days_since = (now - sent_at).days

            if (
                lead.stage == PipelineStage.SENT
                and days_since >= self.follow_up_days.get("first", 5)
            ):
                due.append((lead, 1))
            elif (
                lead.stage == PipelineStage.FOLLOW_UP_1
                and days_since >= self.follow_up_days.get("second", 12)
            ):
                due.append((lead, 2))

        log.info("followups_due", count=len(due))
        return due

    def advance_to_followup(self, lead: Lead, followup_number: int) -> Lead:
        """Advance a lead to the appropriate follow-up stage."""
        target = (
            PipelineStage.FOLLOW_UP_1
            if followup_number == 1
            else PipelineStage.FOLLOW_UP_2
        )
        return self.tracker.advance_stage(
            lead, target, notes=f"Auto follow-up #{followup_number}"
        )
