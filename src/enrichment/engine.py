"""Enrichment engine — orchestrates website fetching and Gemini analysis."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime

import structlog

from src.config.loader import AppConfig, load_config
from src.db.models import EnrichmentData, Lead, PipelineStage
from src.enrichment.analyzer import analyze_website
from src.enrichment.fetcher import fetch_website_text

log = structlog.get_logger()


class EnrichmentEngine:
    """Orchestrates lead enrichment: fetch website → analyze with Gemini → store results."""

    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or load_config()
        self.enrichment_config = self.config.scraping.enrichment
        self._semaphore = asyncio.Semaphore(self.enrichment_config.max_concurrent)
        self._last_gemini_call = 0.0
        self._rpm = self.config.rate_limits.enrichment_rpm

    async def _rate_limit(self) -> None:
        """Enforce rate limiting between Gemini calls."""
        min_interval = 60.0 / self._rpm
        now = time.monotonic()
        elapsed = now - self._last_gemini_call
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_gemini_call = time.monotonic()

    async def enrich_lead(self, lead: Lead) -> Lead:
        """Enrich a single lead by fetching its website and analyzing content.

        Leads without websites are skipped gracefully.
        Failed enrichments still allow the lead to advance to SCORED.
        """
        if not lead.website:
            lead.enrichment = EnrichmentData(
                enrichment_status="skipped",
                enrichment_error="No website URL",
            )
            log.info("enrichment_skipped", lead=lead.business_name, reason="no_website")
            return lead

        async with self._semaphore:
            # Fetch website text + best menu URL
            text, menu_url = await fetch_website_text(
                lead.website, self.enrichment_config
            )

            if not text:
                lead.enrichment = EnrichmentData(
                    enrichment_status="failed",
                    enrichment_error="Could not fetch website content",
                    enrichment_source="website",
                )
                log.warning(
                    "enrichment_fetch_failed",
                    lead=lead.business_name,
                    url=lead.website,
                )
                return lead

            # Rate limit before Gemini call
            await self._rate_limit()

            # Analyze with Gemini
            enrichment = await analyze_website(
                text, lead, self.enrichment_config, menu_url=menu_url
            )

            lead.enrichment = enrichment
            lead.enriched_at = datetime.now()

            if enrichment.enrichment_status == "success":
                lead.stage = PipelineStage.ENRICHED

            log.info(
                "lead_enriched",
                lead=lead.business_name,
                status=enrichment.enrichment_status,
                category=(
                    enrichment.venue_category.value
                    if enrichment.venue_category
                    else None
                ),
            )
            return lead

    async def enrich_leads(self, leads: list[Lead]) -> list[Lead]:
        """Enrich a batch of leads concurrently (bounded by max_concurrent)."""
        if not self.enrichment_config.enabled:
            log.info("enrichment_disabled")
            return leads

        tasks = [self.enrich_lead(lead) for lead in leads]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        enriched = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                log.error(
                    "enrichment_exception",
                    lead=leads[i].business_name,
                    error=str(result),
                )
                leads[i].enrichment = EnrichmentData(
                    enrichment_status="failed",
                    enrichment_error=str(result),
                )
                enriched.append(leads[i])
            else:
                enriched.append(result)

        success_count = sum(
            1
            for l in enriched
            if l.enrichment and l.enrichment.enrichment_status == "success"
        )
        log.info(
            "batch_enriched",
            total=len(enriched),
            success=success_count,
            skipped=sum(
                1
                for l in enriched
                if l.enrichment and l.enrichment.enrichment_status == "skipped"
            ),
            failed=sum(
                1
                for l in enriched
                if l.enrichment and l.enrichment.enrichment_status == "failed"
            ),
        )
        return enriched
