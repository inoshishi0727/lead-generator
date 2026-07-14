"""Enrichment engine — orchestrates website fetching and Gemini analysis."""

from __future__ import annotations

import asyncio
import time
from datetime import datetime

import structlog

from src.config.loader import AppConfig, load_config
from src.db.models import EnrichmentData, Lead, MenuFit, PipelineStage
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

    @staticmethod
    def _merge_enrichment(website_enr, research_enr, sources: list[str]) -> EnrichmentData:
        """Merge website analysis + grounded research into one profile.

        Website wins for menu/drinks/tone specifics; research fills
        firmographics / contact / summary / why-fits. `drinks_programme` takes
        the longer (more complete) of the two. Any source present → success.
        """
        w, r = website_enr, research_enr

        def first(*vals):
            for v in vals:
                if v not in (None, [], ""):
                    return v
            return None

        def longer(a, b):
            a, b = a or "", b or ""
            best = a if len(a) >= len(b) else b
            return best or None

        def get(obj, attr):
            return getattr(obj, attr, None) if obj else None

        # menu_fit: prefer a decisive (non-UNKNOWN) rating from either source.
        menu_fit = None
        for e in (w, r):
            mf = get(e, "menu_fit")
            if mf and mf != MenuFit.UNKNOWN:
                menu_fit = mf
                break
        menu_fit = menu_fit or get(w, "menu_fit") or get(r, "menu_fit") or MenuFit.UNKNOWN

        wc = w.contact if (w and w.contact and w.contact.name) else None
        rc = r.contact if (r and r.contact and r.contact.name) else None

        return EnrichmentData(
            venue_category=first(get(w, "venue_category"), get(r, "venue_category")),
            business_summary=first(get(w, "business_summary"), get(r, "business_summary")),
            location_area=first(get(w, "location_area"), get(r, "location_area")),
            menu_fit=menu_fit,
            menu_fit_signals=first(get(w, "menu_fit_signals"), get(r, "menu_fit_signals")) or [],
            drinks_programme=longer(get(w, "drinks_programme"), get(r, "drinks_programme")),
            why_asterley_fits=first(get(w, "why_asterley_fits"), get(r, "why_asterley_fits")),
            context_notes=first(get(w, "context_notes"), get(r, "context_notes")),
            lead_products=first(get(w, "lead_products"), get(r, "lead_products")) or [],
            tone_tier=first(get(w, "tone_tier"), get(r, "tone_tier")),
            contact=wc or rc,
            opening_hours_summary=first(get(w, "opening_hours_summary"), get(r, "opening_hours_summary")),
            price_tier=first(get(w, "price_tier"), get(r, "price_tier")),
            menu_url=get(w, "menu_url"),
            menu_text=get(w, "menu_text"),
            menu_asset_url=get(w, "menu_asset_url"),
            ai_approval=first(get(w, "ai_approval"), get(r, "ai_approval")),
            ai_approval_reason=first(get(w, "ai_approval_reason"), get(r, "ai_approval_reason")),
            enrichment_source="+".join(sources) if sources else None,
            enrichment_status="success" if sources else "failed",
        )

    async def enrich_lead(self, lead: Lead, on_step=None) -> Lead:
        """Enrich a lead from ALL sources — Google Maps, its own website, and
        grounded web research (reviews / articles / social) — merged into one
        profile. Never dead-ends at "no website": if no site is found, grounded
        research alone enriches the lead. `on_step(msg)` surfaces live progress.
        """
        step = on_step if callable(on_step) else (lambda _m: None)
        cfg = self.enrichment_config

        async with self._semaphore:
            website_enr = None
            research_enr = None
            sources: list[str] = []

            # 1) Google Maps — authoritative website + rating / reviews / category.
            if getattr(cfg, "use_gmaps_discovery", True):
                step("checking Google Maps listing")
                try:
                    from src.scrapers.single_venue import resolve_gmaps_details

                    gm = await resolve_gmaps_details(lead.business_name or lead.website or "")
                    if gm:
                        if not lead.website and gm.website:
                            lead.website = gm.website
                        for attr in ("rating", "review_count", "category", "phone",
                                     "address", "google_maps_place_id", "location_area",
                                     "location_postcode", "location_city"):
                            if getattr(lead, attr, None) in (None, "") and getattr(gm, attr, None) not in (None, ""):
                                setattr(lead, attr, getattr(gm, attr))
                        sources.append("google_maps")
                except Exception as exc:
                    log.warning("enrich_gmaps_failed", lead=lead.business_name, error=str(exc))

            # 2) Website deep-crawl + Gemini analysis (menu / drinks depth).
            if lead.website:
                step("reading website")
                try:
                    result = await fetch_website_text(lead.website, cfg, on_step=step)
                    if result.text:
                        await self._rate_limit()
                        step("analyzing website with AI")
                        website_enr = await analyze_website(
                            result.text, lead, cfg, menu_url=result.menu_url
                        )
                        if result.asset_bytes and result.asset_mime:
                            from src.db.storage import upload_menu_asset

                            website_enr.menu_asset_url = (
                                upload_menu_asset(str(lead.id), result.asset_bytes, result.asset_mime)
                                or result.menu_url
                            )
                        elif result.menu_url:
                            website_enr.menu_asset_url = result.menu_url
                        if website_enr.enrichment_status == "success":
                            sources.append("website")
                except Exception as exc:
                    log.warning("enrich_website_failed", lead=lead.business_name, url=lead.website, error=str(exc))

            # 3) Grounded multi-source research (reviews / articles / Maps / social).
            if getattr(cfg, "use_grounded_research", True):
                step("researching reviews & articles")
                try:
                    from src.scrapers.text_lead_parser import research_lead_via_gemini
                    from src.enrichment.analyzer import research_to_enrichment

                    seed = " ".join(x for x in (
                        lead.business_name, lead.location_area, lead.address) if x).strip()
                    researched = await asyncio.to_thread(research_lead_via_gemini, seed)
                    if researched:
                        research_enr = research_to_enrichment(researched)
                        if not lead.website and researched.get("website"):
                            lead.website = researched["website"]
                        for key in ("phone", "address", "contact_name", "contact_role", "contact_email"):
                            if not getattr(lead, key, None) and researched.get(key):
                                setattr(lead, key, researched[key])
                        sources.append("research")
                except Exception as exc:
                    log.warning("enrich_research_failed", lead=lead.business_name, error=str(exc))

            # 4) Merge everything into one profile.
            step("merging sources")
            merged = self._merge_enrichment(website_enr, research_enr, sources)
            if not sources:
                merged.enrichment_error = "No data from Google Maps, website, or web research"
            lead.enrichment = merged
            lead.enriched_at = datetime.now()
            if merged.enrichment_status == "success":
                lead.stage = PipelineStage.ENRICHED

            log.info(
                "lead_enriched",
                lead=lead.business_name,
                status=merged.enrichment_status,
                sources=("+".join(sources) or "none"),
                category=(merged.venue_category.value if merged.venue_category else None),
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
