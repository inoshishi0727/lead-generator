"""Pipeline stage management with transition validation."""

from __future__ import annotations

import structlog

from src.config.loader import LeadRatiosConfig
from src.db.models import Lead, PipelineStage

log = structlog.get_logger()

# Valid stage transitions — each stage maps to its allowed next stages
VALID_TRANSITIONS: dict[PipelineStage, list[PipelineStage]] = {
    PipelineStage.SCRAPED: [PipelineStage.ENRICHED, PipelineStage.SCORED],
    PipelineStage.NEEDS_EMAIL: [PipelineStage.ENRICHED, PipelineStage.SCORED],
    PipelineStage.ENRICHED: [PipelineStage.SCORED],
    PipelineStage.SCORED: [PipelineStage.DRAFT_GENERATED],
    PipelineStage.DRAFT_GENERATED: [PipelineStage.APPROVED, PipelineStage.DECLINED],
    PipelineStage.APPROVED: [PipelineStage.SENT],
    PipelineStage.SENT: [
        PipelineStage.FOLLOW_UP_1,
        PipelineStage.RESPONDED,
        PipelineStage.DECLINED,
    ],
    PipelineStage.FOLLOW_UP_1: [
        PipelineStage.FOLLOW_UP_2,
        PipelineStage.RESPONDED,
        PipelineStage.DECLINED,
    ],
    PipelineStage.FOLLOW_UP_2: [
        PipelineStage.RESPONDED,
        PipelineStage.DECLINED,
    ],
    PipelineStage.RESPONDED: [PipelineStage.CONVERTED, PipelineStage.DECLINED],
    PipelineStage.CONVERTED: [],
    PipelineStage.DECLINED: [],
}


class PipelineTracker:
    """Manages lead progression through pipeline stages."""

    def advance_stage(
        self,
        lead: Lead,
        new_stage: PipelineStage,
        notes: str | None = None,
    ) -> Lead:
        """Advance a lead to a new stage with validation.

        Raises ValueError if the transition is not allowed.
        """
        current = PipelineStage(lead.stage) if isinstance(lead.stage, str) else lead.stage
        allowed = VALID_TRANSITIONS.get(current, [])

        if new_stage not in allowed:
            raise ValueError(
                f"Invalid transition: {current.value} -> {new_stage.value}. "
                f"Allowed: {[s.value for s in allowed]}"
            )

        log.info(
            "stage_transition",
            lead=lead.business_name,
            from_stage=current.value,
            to_stage=new_stage.value,
            notes=notes,
        )

        lead.stage = new_stage
        return lead

    def get_stage_counts(self, leads: list[Lead]) -> dict[str, int]:
        """Count leads in each pipeline stage."""
        counts: dict[str, int] = {stage.value: 0 for stage in PipelineStage}
        for lead in leads:
            stage_val = lead.stage.value if isinstance(lead.stage, PipelineStage) else lead.stage
            counts[stage_val] = counts.get(stage_val, 0) + 1
        return counts

    def get_funnel_metrics(self, leads: list[Lead]) -> dict[str, float]:
        """Calculate conversion rates between stages."""
        counts = self.get_stage_counts(leads)
        total = len(leads) or 1

        return {
            "scraped_to_scored": counts["scored"] / total * 100,
            "scored_to_drafted": counts["draft_generated"] / total * 100,
            "drafted_to_approved": counts["approved"] / total * 100,
            "approved_to_sent": counts["sent"] / total * 100,
            "sent_to_responded": counts["responded"] / total * 100,
            "responded_to_converted": counts["converted"] / total * 100,
        }

    @staticmethod
    def get_category_counts(leads: list[Lead]) -> dict[str, int]:
        """Count leads per venue category from enrichment data."""
        counts: dict[str, int] = {}
        for lead in leads:
            cat = "other"
            if lead.enrichment and lead.enrichment.venue_category:
                cat = lead.enrichment.venue_category.value
            counts[cat] = counts.get(cat, 0) + 1
        return counts

    @staticmethod
    def get_category_counts_from_docs(docs: list[dict]) -> dict[str, int]:
        """Count leads per venue category from Firestore docs."""
        counts: dict[str, int] = {}
        for doc in docs:
            enrichment = doc.get("enrichment") or {}
            cat = enrichment.get("venue_category", "other") or "other"
            counts[cat] = counts.get(cat, 0) + 1
        return counts

    @staticmethod
    def get_category_distribution(category_counts: dict[str, int]) -> dict[str, float]:
        """Convert category counts to percentages."""
        total = sum(category_counts.values()) or 1
        return {cat: count / total for cat, count in category_counts.items()}

    @staticmethod
    def get_deficit_categories(
        actual: dict[str, float],
        ratios: LeadRatiosConfig,
    ) -> list[dict]:
        """Compare actual distribution vs target ratios, sorted by largest deficit."""
        target = ratios.model_dump()
        deficits = []
        for cat, target_pct in target.items():
            actual_pct = actual.get(cat, 0.0)
            delta = target_pct - actual_pct
            deficits.append({
                "category": cat,
                "target": target_pct,
                "actual": round(actual_pct, 4),
                "delta": round(delta, 4),
            })
        deficits.sort(key=lambda d: d["delta"], reverse=True)
        return deficits
