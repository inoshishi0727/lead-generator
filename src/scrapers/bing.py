"""Bing Search scraper using Camoufox + Playwright.

Same purpose as GoogleSearchScraper but uses Bing — less aggressive
bot detection, different result ranking surfaces different leads.

Flow mirrors gsearch.py: warmup -> search -> extract -> filter -> email -> save.
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import urlparse

import structlog

from src.config.loader import AppConfig, load_config
from src.db.client import get_firestore_client
from src.db.dedup import SharedDedupSet, build_dedup_key, get_all_dedup_keys, record_dedup_key
from src.db.firestore import save_lead_immediate, save_leads
from src.db.models import Lead, LeadSource, PipelineStage
from src.scrapers.base import BaseScraper, ScraperError
from src.scrapers.email_extractor import extract_email_from_website
from src.scrapers.humanize.scroll import smooth_scroll
from src.scrapers.humanize.timing import human_pause, quick_pause
from src.scrapers.humanize.warmup import warmup_browsing
from src.scrapers.selectors.bing_selectors import (
    AD_CONTAINER,
    CONSENT_ACCEPT_SELECTORS,
    NEXT_PAGE,
    RESULT_CONTAINER,
    RESULT_LINK,
    RESULT_SNIPPET,
    RESULT_TITLE_LINK,
    SEARCH_INPUT,
)

log = structlog.get_logger()

NOISE_TITLE_PATTERNS = re.compile(
    r"\b(top \d+|best \d+|\d+ best|review|compared|vs\.?|directory|listing)\b",
    re.IGNORECASE,
)


class BingSearchScraper(BaseScraper):
    """Scrapes company leads from Bing Search organic results."""

    def __init__(
        self,
        config: AppConfig | None = None,
        on_progress: callable | None = None,
        shared_dedup: SharedDedupSet | None = None,
    ) -> None:
        super().__init__(config)
        self.bing_config = self.config.scraping.bing_search
        self.collected_leads: list[Lead] = []
        self._on_progress = on_progress or (lambda **kw: None)
        self._shared_dedup = shared_dedup
        self._skip_domains = set(
            d.lower().lstrip("www.") for d in self.bing_config.skip_domains
        )

    def _is_skippable_url(self, url: str) -> bool:
        """Check if a URL should be skipped."""
        try:
            domain = urlparse(url).netloc.lower().lstrip("www.")
        except Exception:
            return True
        if not domain:
            return True
        for skip in self._skip_domains:
            if domain == skip or domain.endswith(f".{skip}"):
                return True
        if "bing." in domain or "microsoft." in domain:
            return True
        return False

    def _is_noise_title(self, title: str) -> bool:
        """Check if a result title looks like a listicle or directory."""
        return bool(NOISE_TITLE_PATTERNS.search(title))

    async def _dismiss_consent(self, page) -> None:
        """Dismiss Bing consent dialog if present."""
        for selector in CONSENT_ACCEPT_SELECTORS:
            try:
                btn = await page.query_selector(selector)
                if btn:
                    await btn.click()
                    log.info("bing_consent_dismissed", selector=selector)
                    await page.wait_for_load_state("domcontentloaded", timeout=5000)
                    return
            except Exception:
                continue

    async def _human_search(self, page, query: str) -> None:
        """Navigate to Bing and type the search query like a human."""
        await self._navigate_with_retry(page, "https://www.bing.com/?cc=gb")
        await self._dismiss_consent(page)
        await human_pause("navigation")

        search_box = None
        selectors = [SEARCH_INPUT, "input#sb_form_q", "textarea[name='q']"]
        for sel in selectors:
            try:
                search_box = await page.wait_for_selector(sel, state="visible", timeout=8000)
                if search_box:
                    break
            except Exception:
                continue

        if not search_box:
            try:
                await page.screenshot(path="data/debug_bing_searchbox_fail.png")
            except Exception:
                pass
            raise ScraperError("Could not find Bing search box")

        await search_box.click()
        await quick_pause()

        for char in query:
            await page.keyboard.type(char, delay=50 + (hash(char) % 80))
        await human_pause("after_click")

        await page.keyboard.press("Enter")
        await human_pause("navigation")

    async def _extract_results(self, page) -> list[dict]:
        """Extract organic search results from the current Bing SERP."""
        results = []

        containers = await page.query_selector_all(RESULT_CONTAINER)
        if not containers:
            log.warning("no_bing_result_containers_found")
            return results

        for container in containers:
            try:
                # Skip ads
                parent = await container.evaluate("el => el.closest('.b_ad')")
                if parent:
                    continue

                title_el = await container.query_selector(RESULT_TITLE_LINK)
                if not title_el:
                    continue
                title = (await title_el.inner_text()).strip()

                link_el = await container.query_selector(RESULT_LINK)
                if not link_el:
                    continue
                href = await link_el.get_attribute("href")
                if not href or not href.startswith("http"):
                    continue

                snippet = ""
                snippet_el = await container.query_selector(RESULT_SNIPPET)
                if snippet_el:
                    snippet = (await snippet_el.inner_text()).strip()

                results.append({
                    "title": title,
                    "url": href,
                    "snippet": snippet,
                })
            except Exception:
                log.debug("bing_result_extract_failed")
                continue

        log.info("bing_serp_results_extracted", count=len(results))
        return results

    async def _scrape_query(self, page, query: str) -> list[Lead]:
        """Scrape leads for a single search query on Bing."""
        await self._human_search(page, query)

        try:
            await page.wait_for_selector(RESULT_CONTAINER, state="attached", timeout=15000)
        except Exception:
            await self._dismiss_consent(page)
            try:
                await page.wait_for_selector(RESULT_CONTAINER, state="attached", timeout=10000)
            except Exception:
                log.error("bing_results_not_found", query=query)
                try:
                    await page.screenshot(path="data/debug_bing_no_results.png")
                except Exception:
                    pass
                return []

        target = self.bing_config.results_per_query

        if self._shared_dedup:
            known_keys = set()
        else:
            known_keys = get_all_dedup_keys(source="bing_search")

        all_results: list[dict] = []
        pages_scraped = 0
        max_pages = 3

        while len(all_results) < target and pages_scraped < max_pages:
            results = await self._extract_results(page)
            if not results:
                break

            all_results.extend(results)
            pages_scraped += 1

            if len(all_results) >= target:
                break

            next_btn = await page.query_selector(NEXT_PAGE)
            if not next_btn:
                break

            await smooth_scroll(page, "down", 300)
            await human_pause("reading_short")
            await next_btn.click()
            await human_pause("navigation")

            try:
                await page.wait_for_selector(RESULT_CONTAINER, state="attached", timeout=15000)
            except Exception:
                break

        leads: list[Lead] = []
        consecutive_failures = 0

        for i, result in enumerate(all_results[:target]):
            url = result["url"]
            title = result["title"]

            if self._is_skippable_url(url):
                log.debug("bing_skipping_url", url=url, reason="domain_filter")
                continue
            if self._is_noise_title(title):
                log.debug("bing_skipping_url", url=url, reason="noise_title")
                continue

            pct = int((i / max(target, 1)) * 90)
            self._on_progress(phase="processing", progress=min(pct, 90), current_lead=title)

            domain = urlparse(url).netloc.lower().lstrip("www.")
            dedup_key = build_dedup_key("bing_search", title.strip().lower(), domain)

            if self._shared_dedup:
                prefix = f"bing_search|{title.strip().lower()}|"
                if await self._shared_dedup.contains_prefix(prefix):
                    continue
            elif any(k.startswith(f"bing_search|{title.strip().lower()}|") for k in known_keys):
                continue

            email = None
            try:
                email = await extract_email_from_website(page, url)
                consecutive_failures = 0
            except Exception:
                consecutive_failures += 1
                log.warning("bing_email_extraction_failed", url=url)
                if consecutive_failures >= 5:
                    log.warning("bing_too_many_failures_stopping", failures=consecutive_failures)
                    break

            email_domain = email.split("@")[1] if email and "@" in email else None

            lead = Lead(
                source=LeadSource.BING_SEARCH,
                business_name=title,
                website=url,
                email=email,
                email_found=bool(email),
                email_domain=email_domain,
                stage=PipelineStage.SCRAPED if email else PipelineStage.NEEDS_EMAIL,
            )

            if self._shared_dedup:
                is_new = await self._shared_dedup.check_and_add(dedup_key)
                if not is_new:
                    continue
                save_lead_immediate(lead)
            else:
                known_keys.add(dedup_key)

            record_dedup_key(dedup_key)
            leads.append(lead)

            await human_pause("between_listings")

        if leads and not self._shared_dedup:
            saved = save_leads(leads)
            log.info("bing_leads_persisted", saved=saved, total=len(leads))

        log.info(
            "bing_query_done",
            query=query,
            total=len(leads),
            with_email=sum(1 for l in leads if l.email),
        )
        return leads

    async def scrape(self) -> list[Lead]:
        """Execute full Bing Search scraping across all queries."""
        db = get_firestore_client()
        if db is None:
            log.warning("firestore_unavailable_bing")

        headless = self.bing_config.headless
        ctx = await self._launch_browser(headless=headless)

        anchor = await ctx.new_page() if not headless else None

        self._on_progress(phase="warmup", progress=5)
        await warmup_browsing(ctx)

        page = await ctx.new_page()

        if anchor:
            await anchor.close()

        try:
            await page.goto("https://www.bing.com", wait_until="domcontentloaded", timeout=15000)
            await self._dismiss_consent(page)
        except Exception:
            log.warning("bing_pre_consent_failed")

        for query in self.bing_config.search_queries:
            log.info("bing_scraping_query", query=query)
            self._on_progress(phase="searching", progress=15)
            leads = await self._scrape_query(page, query)
            self.collected_leads.extend(leads)
            log.info(
                "bing_query_complete",
                query=query,
                found=len(leads),
                total=len(self.collected_leads),
            )

        await page.close()

        log.info(
            "bing_scrape_summary",
            queries=len(self.bing_config.search_queries),
            total_leads=len(self.collected_leads),
            with_email=sum(1 for l in self.collected_leads if l.email),
            without_email=sum(1 for l in self.collected_leads if not l.email),
        )
        return self.collected_leads


async def main() -> None:
    """CLI entry point for dry-run testing."""
    import argparse
    import csv
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Bing Search Scraper")
    parser.add_argument("--dry-run", action="store_true", help="Run without saving to DB")
    parser.add_argument("--headless", action="store_true", help="Run browser headless")
    parser.add_argument("--query", type=str, help="Override search query (single)")
    parser.add_argument("--limit", type=int, default=20, help="Max results per query")
    parser.add_argument("--out", type=str, default="bing_leads.csv", help="Output CSV path")
    parser.add_argument("--debug", action="store_true", help="Enable DEBUG-level logging")
    args = parser.parse_args()

    if args.debug:
        import logging
        logging.basicConfig(level=logging.DEBUG, format="%(message)s")
        structlog.configure(
            wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        )

    base = load_config()
    config = base.model_copy(deep=True)
    if args.query:
        config.scraping.bing_search.search_queries = [args.query]
    config.scraping.bing_search.headless = args.headless
    config.scraping.bing_search.results_per_query = args.limit

    scraper = BingSearchScraper(config=config)
    log.info("bing_scrape_start", headless=args.headless, limit=args.limit)

    leads = await scraper.run()

    for lead in leads:
        stage = lead.stage.value
        print(f"  [{stage}] {lead.business_name} | {lead.website} | {lead.email}")
    print(f"\nTotal leads: {len(leads)}")
    print(f"  With email: {sum(1 for l in leads if l.email)}")
    print(f"  Needs email: {sum(1 for l in leads if not l.email)}")

    if leads:
        out_path = Path(args.out)
        fields = ["business_name", "website", "email", "stage"]
        with open(out_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            for lead in leads:
                row = {k: getattr(lead, k, None) for k in fields}
                row["stage"] = lead.stage.value
                writer.writerow(row)
        print(f"Saved to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
