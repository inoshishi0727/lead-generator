"""Parallel scrape orchestrator — runs multiple Camoufox instances concurrently."""

from __future__ import annotations

import asyncio
from pathlib import Path

import structlog

from src.config.loader import AppConfig, load_config
from src.db.dedup import SharedDedupSet
from src.db.exclusions import ExclusionSet, load_exclusion_set
from src.db.models import Lead
from src.scrapers.gmaps import GoogleMapsScraper
from src.scrapers.instagram import InstagramScraper

log = structlog.get_logger()


class ParallelScrapeOrchestrator:
    """Runs multiple scraper instances concurrently, one per query/hashtag.

    Each worker gets its own Camoufox browser instance. A SharedDedupSet
    prevents duplicate leads across workers. Leads are saved to Firestore
    immediately on extraction.
    """

    def __init__(
        self,
        config: AppConfig | None = None,
        on_progress: callable | None = None,
        skip_gmaps_types: set[str] | None = None,
    ) -> None:
        self.config = config or load_config()
        self._on_progress = on_progress or (lambda **kw: None)
        self._exclusion_set = self._load_exclusions()
        self._skip_gmaps_types = skip_gmaps_types or set()

    def _load_exclusions(self) -> ExclusionSet:
        """Load the stockist exclusion set from config."""
        csv_path = self.config.exclusion.stockist_csv
        return load_exclusion_set(csv_path)

    def _filter_excluded(self, leads: list[Lead]) -> list[Lead]:
        """Remove leads that match the exclusion set."""
        filtered = []
        for lead in leads:
            if self._exclusion_set.is_excluded(
                lead.business_name,
                website=lead.website,
                address=lead.address,
            ):
                log.info("lead_excluded_stockist", business_name=lead.business_name)
            else:
                filtered.append(lead)

        excluded_count = len(leads) - len(filtered)
        if excluded_count > 0:
            log.info("leads_excluded", excluded=excluded_count, remaining=len(filtered))
        return filtered

    async def scrape_gmaps(self) -> list[Lead]:
        """Run Google Maps scrapers in parallel, one per search query."""
        queries = self.config.scraping.google_maps.search_queries
        max_parallel = self.config.scraping.google_maps.max_parallel_browsers

        if not queries:
            log.info("no_gmaps_queries_configured")
            return []

        # Pre-load dedup set from Firestore + local JSON
        shared_dedup = SharedDedupSet()
        await shared_dedup.load_from_db("google_maps")

        semaphore = asyncio.Semaphore(max_parallel)

        async def _worker(query: str) -> list[Lead]:
            async with semaphore:
                log.info("gmaps_worker_start", query=query)
                worker_config = self.config.model_copy(deep=True)
                worker_config.scraping.google_maps.search_queries = [query]

                scraper = GoogleMapsScraper(
                    config=worker_config,
                    on_progress=self._on_progress,
                    shared_dedup=shared_dedup,
                    skip_gmaps_types=self._skip_gmaps_types,
                )
                try:
                    leads = await scraper.run()
                    log.info(
                        "gmaps_worker_done",
                        query=query,
                        leads=len(leads),
                    )
                    return leads
                except Exception as exc:
                    log.error(
                        "gmaps_worker_failed",
                        query=query,
                        error=str(exc),
                    )
                    raise

        tasks = [_worker(q) for q in queries]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_leads: list[Lead] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                log.error(
                    "gmaps_query_failed",
                    query=queries[i],
                    error=str(result),
                )
            else:
                all_leads.extend(result)

        # Filter out existing stockists
        all_leads = self._filter_excluded(all_leads)

        log.info(
            "gmaps_parallel_done",
            queries=len(queries),
            total_leads=len(all_leads),
            workers=min(len(queries), max_parallel),
        )
        return all_leads

    async def scrape_instagram(self) -> list[Lead]:
        """Run Instagram scrapers in parallel, one per hashtag."""
        hashtags = self.config.scraping.instagram.hashtags
        max_parallel = self.config.scraping.instagram.max_parallel_browsers

        if not hashtags:
            log.info("no_instagram_hashtags_configured")
            return []

        # Pre-load dedup set
        shared_dedup = SharedDedupSet()
        await shared_dedup.load_from_db("instagram")

        semaphore = asyncio.Semaphore(max_parallel)

        async def _worker(hashtag: str) -> list[Lead]:
            async with semaphore:
                log.info("ig_worker_start", hashtag=hashtag)
                worker_config = self.config.model_copy(deep=True)
                worker_config.scraping.instagram.hashtags = [hashtag]

                scraper = InstagramScraper(
                    config=worker_config,
                    shared_dedup=shared_dedup,
                )
                try:
                    leads = await scraper.run()
                    log.info(
                        "ig_worker_done",
                        hashtag=hashtag,
                        leads=len(leads),
                    )
                    return leads
                except Exception as exc:
                    log.error(
                        "ig_worker_failed",
                        hashtag=hashtag,
                        error=str(exc),
                    )
                    raise

        tasks = [_worker(h) for h in hashtags]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_leads: list[Lead] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                log.error(
                    "ig_hashtag_failed",
                    hashtag=hashtags[i],
                    error=str(result),
                )
            else:
                all_leads.extend(result)

        # Filter out existing stockists
        all_leads = self._filter_excluded(all_leads)

        log.info(
            "ig_parallel_done",
            hashtags=len(hashtags),
            total_leads=len(all_leads),
        )
        return all_leads

    async def run(self) -> list[Lead]:
        """Run all scrapers in parallel, then return combined leads.

        Google Maps and Instagram scrapers run concurrently.
        """
        gmaps_task = self.scrape_gmaps()
        ig_task = self.scrape_instagram()

        gmaps_leads, ig_leads = await asyncio.gather(
            gmaps_task, ig_task, return_exceptions=True
        )

        all_leads: list[Lead] = []
        if isinstance(gmaps_leads, Exception):
            log.error("gmaps_scraping_failed", error=str(gmaps_leads))
        else:
            all_leads.extend(gmaps_leads)

        if isinstance(ig_leads, Exception):
            log.error("ig_scraping_failed", error=str(ig_leads))
        else:
            all_leads.extend(ig_leads)

        log.info(
            "parallel_scrape_complete",
            total_leads=len(all_leads),
            gmaps=len(gmaps_leads) if not isinstance(gmaps_leads, Exception) else 0,
            instagram=len(ig_leads) if not isinstance(ig_leads, Exception) else 0,
        )
        return all_leads
