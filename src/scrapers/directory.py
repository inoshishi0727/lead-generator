"""Directory site scraper — Yell.com and Trustpilot.

Listing pagination pattern (not search): browse category pages,
paginate through business listings, extract name + website + phone.

Flow:
  1. Warmup browsing.
  2. For each category URL: load page, extract listings, paginate.
  3. For each listing: visit website for email extraction.
  4. Build Lead objects and save to Firestore.
"""

from __future__ import annotations

import asyncio
from urllib.parse import urlparse

import structlog

from src.config.loader import AppConfig, load_config
from src.db.client import get_firestore_client
from src.db.dedup import SharedDedupSet, build_dedup_key, get_all_dedup_keys, record_dedup_key
from src.db.firestore import save_lead_immediate, save_leads
from src.db.models import Lead, LeadSource, PipelineStage
from src.scrapers.base import BaseScraper
from src.scrapers.email_extractor import extract_email_from_website
from src.scrapers.humanize.scroll import smooth_scroll
from src.scrapers.humanize.timing import human_pause, quick_pause
from src.scrapers.humanize.warmup import warmup_browsing
from src.scrapers.selectors.directory_selectors import (
    TP_BUSINESS_LINK,
    TP_BUSINESS_NAME,
    TP_CONSENT_SELECTORS,
    TP_LISTING_CARD,
    TP_NEXT_PAGE,
    YELL_ADDRESS,
    YELL_BUSINESS_NAME,
    YELL_CONSENT_SELECTORS,
    YELL_LISTING_CARD,
    YELL_NEXT_PAGE,
    YELL_PHONE,
    YELL_PHONE_REVEAL,
    YELL_WEBSITE_LINK,
)

log = structlog.get_logger()


class DirectoryScraper(BaseScraper):
    """Scrapes business leads from directory sites (Yell.com, Trustpilot)."""

    def __init__(
        self,
        config: AppConfig | None = None,
        on_progress: callable | None = None,
        shared_dedup: SharedDedupSet | None = None,
    ) -> None:
        super().__init__(config)
        self.dir_config = self.config.scraping.directory
        self.collected_leads: list[Lead] = []
        self._on_progress = on_progress or (lambda **kw: None)
        self._shared_dedup = shared_dedup

    def _detect_site(self, url: str) -> str:
        """Determine which directory site a URL belongs to."""
        domain = urlparse(url).netloc.lower()
        if "yell" in domain:
            return "yell"
        if "trustpilot" in domain:
            return "trustpilot"
        return "unknown"

    async def _dismiss_consent(self, page, site_type: str) -> None:
        """Dismiss cookie consent for the given directory site."""
        selectors = (
            YELL_CONSENT_SELECTORS if site_type == "yell"
            else TP_CONSENT_SELECTORS
        )
        for selector in selectors:
            try:
                btn = await page.query_selector(selector)
                if btn:
                    await btn.click()
                    log.info("directory_consent_dismissed", site=site_type, selector=selector)
                    await page.wait_for_load_state("domcontentloaded", timeout=5000)
                    return
            except Exception:
                continue

    async def _extract_yell_listings(self, page) -> list[dict]:
        """Extract business listings from a Yell.com category page."""
        listings = []
        cards = await page.query_selector_all(YELL_LISTING_CARD)

        for card in cards:
            try:
                name_el = await card.query_selector(YELL_BUSINESS_NAME)
                if not name_el:
                    continue
                name = (await name_el.inner_text()).strip()

                website = None
                website_el = await card.query_selector(YELL_WEBSITE_LINK)
                if website_el:
                    website = await website_el.get_attribute("href")

                phone = None
                # Yell hides phone numbers — click "Show number" first
                try:
                    reveal_btn = await card.query_selector(YELL_PHONE_REVEAL)
                    if reveal_btn:
                        await reveal_btn.click()
                        await quick_pause()
                except Exception:
                    pass
                phone_el = await card.query_selector(YELL_PHONE)
                if phone_el:
                    phone = (await phone_el.inner_text()).strip()

                address = None
                addr_el = await card.query_selector(YELL_ADDRESS)
                if addr_el:
                    address = (await addr_el.inner_text()).strip()

                listings.append({
                    "name": name,
                    "website": website,
                    "phone": phone,
                    "address": address,
                })
            except Exception:
                log.debug("yell_listing_extract_failed")
                continue

        return listings

    async def _extract_trustpilot_listings(self, page) -> list[dict]:
        """Extract business listings from a Trustpilot category page."""
        listings = []
        cards = await page.query_selector_all(TP_LISTING_CARD)

        for card in cards:
            try:
                name_el = await card.query_selector(TP_BUSINESS_NAME)
                if not name_el:
                    continue
                name = (await name_el.inner_text()).strip()

                website = None
                link_el = await card.query_selector(TP_BUSINESS_LINK)
                if link_el:
                    href = await link_el.get_attribute("href")
                    if href:
                        # Trustpilot links go to /review/domain.com — extract domain
                        if "/review/" in href:
                            domain = href.split("/review/")[-1].strip("/")
                            website = f"https://{domain}"
                        else:
                            website = href

                listings.append({
                    "name": name,
                    "website": website,
                    "phone": None,
                    "address": None,
                })
            except Exception:
                log.debug("trustpilot_listing_extract_failed")
                continue

        return listings

    async def _extract_listings(self, page, site_type: str) -> list[dict]:
        """Extract listings from the current page based on site type."""
        if site_type == "yell":
            return await self._extract_yell_listings(page)
        elif site_type == "trustpilot":
            return await self._extract_trustpilot_listings(page)
        return []

    async def _paginate(self, page, site_type: str) -> bool:
        """Click next page button. Returns False if no more pages."""
        selector = YELL_NEXT_PAGE if site_type == "yell" else TP_NEXT_PAGE

        try:
            next_btn = await page.query_selector(selector)
            if not next_btn:
                return False

            await smooth_scroll(page, "down", 300)
            await human_pause("reading_short")
            await next_btn.click()
            await human_pause("navigation")

            # Wait for listings to load
            card_sel = YELL_LISTING_CARD if site_type == "yell" else TP_LISTING_CARD
            await page.wait_for_selector(card_sel, state="attached", timeout=15000)
            return True
        except Exception:
            return False

    async def _scrape_category(self, page, url: str) -> list[Lead]:
        """Scrape leads from a single category URL with pagination."""
        site_type = self._detect_site(url)
        source = LeadSource.YELL if site_type == "yell" else LeadSource.TRUSTPILOT
        dedup_source = site_type
        max_results = self.dir_config.max_results_per_category

        await self._navigate_with_retry(page, url)
        await self._dismiss_consent(page, site_type)
        await human_pause("navigation")

        # Load dedup keys
        if self._shared_dedup:
            known_keys = set()
        else:
            known_keys = get_all_dedup_keys(source=dedup_source)

        leads: list[Lead] = []
        page_num = 0
        max_pages = 10

        while len(leads) < max_results and page_num < max_pages:
            page_num += 1
            listings = await self._extract_listings(page, site_type)

            if not listings:
                log.info("no_listings_found", url=url, page=page_num)
                break

            log.info("listings_extracted", site=site_type, page=page_num, count=len(listings))

            for listing in listings:
                if len(leads) >= max_results:
                    break

                name = listing["name"]
                website = listing.get("website")

                # Dedup
                dedup_key = build_dedup_key(dedup_source, name.strip().lower(), website or "")
                if self._shared_dedup:
                    prefix = f"{dedup_source}|{name.strip().lower()}|"
                    if await self._shared_dedup.contains_prefix(prefix):
                        continue
                elif any(k.startswith(f"{dedup_source}|{name.strip().lower()}|") for k in known_keys):
                    continue

                # Email extraction
                email = None
                if website:
                    try:
                        email = await extract_email_from_website(page, website)
                    except Exception:
                        log.warning("directory_email_extraction_failed", website=website)

                email_domain = email.split("@")[1] if email and "@" in email else None

                lead = Lead(
                    source=source,
                    business_name=name,
                    website=website,
                    email=email,
                    email_found=bool(email),
                    email_domain=email_domain,
                    phone=listing.get("phone"),
                    address=listing.get("address"),
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

                self._on_progress(
                    phase="directory",
                    progress=int((len(leads) / max(max_results, 1)) * 90),
                    current_lead=name,
                )
                await human_pause("between_listings")

            # Paginate
            if len(leads) < max_results:
                has_next = await self._paginate(page, site_type)
                if not has_next:
                    break

        # Batch save in non-parallel mode
        if leads and not self._shared_dedup:
            saved = save_leads(leads)
            log.info("directory_leads_persisted", saved=saved, total=len(leads))

        log.info(
            "directory_category_done",
            url=url,
            site=site_type,
            total=len(leads),
            with_email=sum(1 for l in leads if l.email),
        )
        return leads

    async def scrape(self) -> list[Lead]:
        """Execute directory scraping across all category URLs."""
        db = get_firestore_client()
        if db is None:
            log.warning("firestore_unavailable_directory")

        headless = self.dir_config.headless
        ctx = await self._launch_browser(headless=headless)

        anchor = await ctx.new_page() if not headless else None

        self._on_progress(phase="warmup", progress=5)
        await warmup_browsing(ctx)

        page = await ctx.new_page()

        if anchor:
            await anchor.close()

        for url in self.dir_config.category_urls:
            log.info("scraping_directory_category", url=url)
            leads = await self._scrape_category(page, url)
            self.collected_leads.extend(leads)
            log.info(
                "directory_category_complete",
                url=url,
                found=len(leads),
                total=len(self.collected_leads),
            )

        await page.close()

        log.info(
            "directory_scrape_summary",
            categories=len(self.dir_config.category_urls),
            total_leads=len(self.collected_leads),
            with_email=sum(1 for l in self.collected_leads if l.email),
        )
        return self.collected_leads


async def main() -> None:
    """CLI entry point for dry-run testing."""
    import argparse

    parser = argparse.ArgumentParser(description="Directory Scraper (Yell/Trustpilot)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--url", type=str, help="Override with a single category URL")
    parser.add_argument("--limit", type=int, default=20, help="Max results per category")
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    if args.debug:
        import logging
        logging.basicConfig(level=logging.DEBUG, format="%(message)s")
        structlog.configure(
            wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        )

    base = load_config()
    config = base.model_copy(deep=True)
    if args.url:
        config.scraping.directory.category_urls = [args.url]
    config.scraping.directory.headless = args.headless
    config.scraping.directory.max_results_per_category = args.limit

    scraper = DirectoryScraper(config=config)
    log.info("directory_scrape_start", headless=args.headless, limit=args.limit)

    leads = await scraper.run()

    for lead in leads:
        stage = lead.stage.value
        print(f"  [{stage}] {lead.business_name} | {lead.website} | {lead.email}")
    print(f"\nTotal leads: {len(leads)}")


if __name__ == "__main__":
    asyncio.run(main())
