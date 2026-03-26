"""Tests for pipeline tracker."""

import pytest

from src.db.models import Lead, LeadSource, PipelineStage
from src.pipeline.tracker import PipelineTracker


def _make_lead(**kwargs) -> Lead:
    defaults = {
        "source": LeadSource.GOOGLE_MAPS,
        "business_name": "Test Bar",
    }
    defaults.update(kwargs)
    return Lead(**defaults)


class TestPipelineTracker:
    def test_valid_transition(self):
        tracker = PipelineTracker()
        lead = _make_lead(stage=PipelineStage.SCRAPED)
        result = tracker.advance_stage(lead, PipelineStage.SCORED)
        assert result.stage == PipelineStage.SCORED

    def test_invalid_transition(self):
        tracker = PipelineTracker()
        lead = _make_lead(stage=PipelineStage.SCRAPED)
        with pytest.raises(ValueError, match="Invalid transition"):
            tracker.advance_stage(lead, PipelineStage.SENT)

    def test_stage_counts(self):
        tracker = PipelineTracker()
        leads = [
            _make_lead(stage=PipelineStage.SCRAPED),
            _make_lead(stage=PipelineStage.SCRAPED),
            _make_lead(stage=PipelineStage.SCORED),
        ]
        counts = tracker.get_stage_counts(leads)
        assert counts["scraped"] == 2
        assert counts["scored"] == 1

    def test_funnel_metrics(self):
        tracker = PipelineTracker()
        leads = [
            _make_lead(stage=PipelineStage.SCRAPED),
            _make_lead(stage=PipelineStage.SCORED),
            _make_lead(stage=PipelineStage.SENT),
            _make_lead(stage=PipelineStage.RESPONDED),
        ]
        metrics = tracker.get_funnel_metrics(leads)
        assert metrics["scraped_to_scored"] == 25.0
        assert metrics["sent_to_responded"] == 25.0

    def test_terminal_states(self):
        tracker = PipelineTracker()
        lead = _make_lead(stage=PipelineStage.CONVERTED)
        with pytest.raises(ValueError):
            tracker.advance_stage(lead, PipelineStage.SCRAPED)
