"""Parallel scrape orchestrator — runs multiple Camoufox instances concurrently."""

from __future__ import annotations

import asyncio
from pathlib import Path

import structlog

from src.config.loader import AppConfig, load_config, load_search_queries
from src.db.dedup import SharedDedupSet, get_all_dedup_keys
from src.db.exclusions import ExclusionSet, load_exclusion_set
from src.db.models import Lead
from src.scrapers.bing import BingSearchScraper
from src.scrapers.directory import DirectoryScraper
from src.scrapers.gmaps import GoogleMapsScraper
from src.scrapers.gsearch import GoogleSearchScraper
from src.scrapers.industry import IndustrySiteScraper
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
        dynamic = load_search_queries()
        queries = dynamic.get("google_maps", self.config.scraping.google_maps.search_queries)
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

    async def scrape_gsearch(self) -> list[Lead]:
        """Run Google Search scrapers in parallel, one per search query."""
        dynamic = load_search_queries()
        queries = dynamic.get("google_search", self.config.scraping.google_search.search_queries)
        max_parallel = self.config.scraping.google_search.max_parallel_browsers

        if not queries:
            log.info("no_gsearch_queries_configured")
            return []

        # Pre-load dedup set from Firestore + local JSON
        shared_dedup = SharedDedupSet()
        await shared_dedup.load_from_db("google_search")

        semaphore = asyncio.Semaphore(max_parallel)

        async def _worker(query: str) -> list[Lead]:
            async with semaphore:
                log.info("gsearch_worker_start", query=query)
                worker_config = self.config.model_copy(deep=True)
                worker_config.scraping.google_search.search_queries = [query]

                scraper = GoogleSearchScraper(
                    config=worker_config,
                    on_progress=self._on_progress,
                    shared_dedup=shared_dedup,
                )
                try:
                    leads = await scraper.run()
                    log.info(
                        "gsearch_worker_done",
                        query=query,
                        leads=len(leads),
                    )
                    return leads
                except Exception as exc:
                    log.error(
                        "gsearch_worker_failed",
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
                    "gsearch_query_failed",
                    query=queries[i],
                    error=str(result),
                )
            else:
                all_leads.extend(result)

        # Filter out existing stockists
        all_leads = self._filter_excluded(all_leads)

        log.info(
            "gsearch_parallel_done",
            queries=len(queries),
            total_leads=len(all_leads),
            workers=min(len(queries), max_parallel),
        )
        return all_leads

    async def scrape_bing(self) -> list[Lead]:
        """Run Bing Search scrapers in parallel, one per search query."""
        dynamic = load_search_queries()
        queries = dynamic.get("bing_search", self.config.scraping.bing_search.search_queries)
        max_parallel = self.config.scraping.bing_search.max_parallel_browsers

        if not queries:
            log.info("no_bing_queries_configured")
            return []

        shared_dedup = SharedDedupSet()
        await shared_dedup.load_from_db("bing_search")

        semaphore = asyncio.Semaphore(max_parallel)

        async def _worker(query: str) -> list[Lead]:
            async with semaphore:
                log.info("bing_worker_start", query=query)
                worker_config = self.config.model_copy(deep=True)
                worker_config.scraping.bing_search.search_queries = [query]

                scraper = BingSearchScraper(
                    config=worker_config,
                    on_progress=self._on_progress,
                    shared_dedup=shared_dedup,
                )
                try:
                    leads = await scraper.run()
                    log.info("bing_worker_done", query=query, leads=len(leads))
                    return leads
                except Exception as exc:
                    log.error("bing_worker_failed", query=query, error=str(exc))
                    raise

        tasks = [_worker(q) for q in queries]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_leads: list[Lead] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                log.error("bing_query_failed", query=queries[i], error=str(result))
            else:
                all_leads.extend(result)

        all_leads = self._filter_excluded(all_leads)

        log.info(
            "bing_parallel_done",
            queries=len(queries),
            total_leads=len(all_leads),
            workers=min(len(queries), max_parallel),
        )
        return all_leads

    async def scrape_directories(self) -> list[Lead]:
        """Run directory scrapers in parallel, one per category URL."""
        dynamic = load_search_queries()
        category_urls = dynamic.get("directory", self.config.scraping.directory.category_urls)
        max_parallel = self.config.scraping.directory.max_parallel_browsers

        if not category_urls:
            log.info("no_directory_urls_configured")
            return []

        shared_dedup = SharedDedupSet()
        # Load dedup for both sources
        await shared_dedup.load_from_db("yell")
        tp_keys = get_all_dedup_keys(source="trustpilot")
        for k in tp_keys:
            await shared_dedup.check_and_add(k)

        semaphore = asyncio.Semaphore(max_parallel)

        async def _worker(url: str) -> list[Lead]:
            async with semaphore:
                log.info("directory_worker_start", url=url)
                worker_config = self.config.model_copy(deep=True)
                worker_config.scraping.directory.category_urls = [url]

                scraper = DirectoryScraper(
                    config=worker_config,
                    on_progress=self._on_progress,
                    shared_dedup=shared_dedup,
                )
                try:
                    leads = await scraper.run()
                    log.info("directory_worker_done", url=url, leads=len(leads))
                    return leads
                except Exception as exc:
                    log.error("directory_worker_failed", url=url, error=str(exc))
                    raise

        tasks = [_worker(u) for u in category_urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_leads: list[Lead] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                log.error("directory_url_failed", url=category_urls[i], error=str(result))
            else:
                all_leads.extend(result)

        all_leads = self._filter_excluded(all_leads)

        log.info(
            "directory_parallel_done",
            urls=len(category_urls),
            total_leads=len(all_leads),
        )
        return all_leads

    async def scrape_industry(self) -> list[Lead]:
        """Run industry site scrapers in parallel, one per site."""
        sites = self.config.scraping.industry_sites.sites
        max_parallel = self.config.scraping.industry_sites.max_parallel_browsers

        if not sites:
            log.info("no_industry_sites_configured")
            return []

        shared_dedup = SharedDedupSet()
        await shared_dedup.load_from_db("industry_directory")

        semaphore = asyncio.Semaphore(max_parallel)

        async def _worker(site_entry) -> list[Lead]:
            async with semaphore:
                log.info("industry_worker_start", site=site_entry.name)
                worker_config = self.config.model_copy(deep=True)
                worker_config.scraping.industry_sites.sites = [site_entry]

                scraper = IndustrySiteScraper(
                    config=worker_config,
                    on_progress=self._on_progress,
                    shared_dedup=shared_dedup,
                )
                try:
                    leads = await scraper.run()
                    log.info("industry_worker_done", site=site_entry.name, leads=len(leads))
                    return leads
                except Exception as exc:
                    log.error("industry_worker_failed", site=site_entry.name, error=str(exc))
                    raise

        tasks = [_worker(s) for s in sites]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_leads: list[Lead] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                log.error("industry_site_failed", site=sites[i].name, error=str(result))
            else:
                all_leads.extend(result)

        all_leads = self._filter_excluded(all_leads)

        log.info(
            "industry_parallel_done",
            sites=len(sites),
            total_leads=len(all_leads),
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

        All scraper types run concurrently: Google Maps, Google Search,
        Bing, directories, industry sites, and Instagram.
        """
        scraper_tasks = {
            "gmaps": self.scrape_gmaps(),
            "gsearch": self.scrape_gsearch(),
            "bing": self.scrape_bing(),
            "directory": self.scrape_directories(),
            "industry": self.scrape_industry(),
            "instagram": self.scrape_instagram(),
        }

        results = await asyncio.gather(
            *scraper_tasks.values(), return_exceptions=True
        )

        all_leads: list[Lead] = []
        counts: dict[str, int] = {}

        for name, result in zip(scraper_tasks.keys(), results):
            if isinstance(result, Exception):
                log.error(f"{name}_scraping_failed", error=str(result))
                counts[name] = 0
            else:
                all_leads.extend(result)
                counts[name] = len(result)

        log.info(
            "parallel_scrape_complete",
            total_leads=len(all_leads),
            **counts,
        )
        return all_leads
