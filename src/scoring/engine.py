"""Scoring engine with configurable weights from config.yaml."""

from __future__ import annotations

import structlog

from src.config.loader import AppConfig, ScoringWeights, load_config
from src.db.models import Lead, ScoreBreakdownItem
from src.scoring.rules import ALL_RULES

log = structlog.get_logger()


class ScoringEngine:
    """Applies weighted scoring rules to leads."""

    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or load_config()
        self.scoring_config = self.config.scoring

    @property
    def weights(self) -> ScoringWeights:
        return self.scoring_config.weights

    def score_lead(
        self,
        lead: Lead,
        weights_override: dict[str, int] | None = None,
    ) -> tuple[int, dict[str, ScoreBreakdownItem]]:
        """Score a single lead and return (total_score, breakdown).

        The total score is the sum of (rule_result * weight) for each rule,
        capped at 100.
        """
        weight_values = (
            weights_override
            if weights_override
            else self.weights.model_dump()
        )

        breakdown: dict[str, ScoreBreakdownItem] = {}
        total = 0

        for rule_name, rule_fn in ALL_RULES.items():
            weight = weight_values.get(rule_name, 0)
            if weight == 0:
                continue

            result, reason = rule_fn(lead)
            points = result * weight
            total += points
            breakdown[rule_name] = ScoreBreakdownItem(points=points, reason=reason)

        # Cap at 100
        total = min(total, 100)

        log.debug(
            "lead_scored",
            business=lead.business_name,
            score=total,
        )
        return total, breakdown

    def score_leads(self, leads: list[Lead]) -> list[Lead]:
        """Score a batch of leads, updating each lead in-place."""
        for lead in leads:
            score, breakdown = self.score_lead(lead)
            lead.score = score
            lead.score_breakdown = breakdown
            if score >= self.scoring_config.min_score_threshold:
                lead.stage = "scored"

        log.info(
            "batch_scored",
            total=len(leads),
            above_threshold=sum(
                1
                for l in leads
                if l.score and l.score >= self.scoring_config.min_score_threshold
            ),
        )
        return leads

    def passes_threshold(self, lead: Lead) -> bool:
        """Check if a lead's score meets the minimum threshold."""
        return (lead.score or 0) >= self.scoring_config.min_score_threshold
