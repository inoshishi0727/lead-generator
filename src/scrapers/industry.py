"""Industry site scraper — The Spirits Business, Difford's Guide, Drinks International.

Generic listing scraper with per-site selector configuration. Each site
entry in config defines its base URL, listing paths, and max results.
Selectors are loaded from industry_selectors.py keyed by site name.

Flow:
  1. Warmup browsing.
  2. For each configured site: load listing pages, extract companies.
  3. For each company: visit website for email extraction.
  4. Build Lead objects and save to Firestore.
"""

from __future__ import annotations

import asyncio
from urllib.parse import urljoin, urlparse

import structlog

from src.config.loader import AppConfig, IndustrySiteEntry, load_config
from src.db.client import get_firestore_client
from src.db.dedup import SharedDedupSet, build_dedup_key, get_all_dedup_keys, record_dedup_key
from src.db.firestore import save_lead_immediate, save_leads
from src.db.models import Lead, LeadSource, PipelineStage
from src.scrapers.base import BaseScraper
from src.scrapers.email_extractor import extract_email_from_website
from src.scrapers.humanize.scroll import smooth_scroll
from src.scrapers.humanize.timing import human_pause
from src.scrapers.humanize.warmup import warmup_browsing
from src.scrapers.selectors.industry_selectors import SITE_SELECTORS

log = structlog.get_logger()


class IndustrySiteScraper(BaseScraper):
    """Scrapes company leads from industry-specific directories and listings."""

    def __init__(
        self,
        config: AppConfig | None = None,
        on_progress: callable | None = None,
        shared_dedup: SharedDedupSet | None = None,
    ) -> None:
        super().__init__(config)
        self.industry_config = self.config.scraping.industry_sites
        self.collected_leads: list[Lead] = []
        self._on_progress = on_progress or (lambda **kw: None)
        self._shared_dedup = shared_dedup

    def _get_selectors(self, site_name: str) -> dict[str, str] | None:
        """Look up selectors for a site by name."""
        selectors = SITE_SELECTORS.get(site_name)
        if not selectors:
            log.warning("no_selectors_for_site", site=site_name)
        return selectors

    async def _dismiss_consent(self, page, selectors: dict) -> None:
        """Dismiss cookie consent using site-specific selector."""
        consent_sel = selectors.get("consent")
        if not consent_sel:
            return
        try:
            btn = await page.query_selector(consent_sel)
            if btn:
                await btn.click()
                log.info("industry_consent_dismissed", selector=consent_sel)
                await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            log.debug("industry_consent_failed")

    async def _extract_listings(self, page, selectors: dict) -> list[dict]:
        """Extract listings from the current page using site-specific selectors."""
        listings = []

        card_sel = selectors.get("listing_card")
        if not card_sel:
            return listings

        cards = await page.query_selector_all(card_sel)

        # Also grab featured listings if selector exists (e.g. Drinks International)
        featured_sel = selectors.get("listing_card_featured")
        if featured_sel:
            featured = await page.query_selector_all(featured_sel)
            cards = featured + cards

        for card in cards:
            try:
                # Extract name
                name = None
                name_sel = selectors.get("name")
                if name_sel:
                    name_el = await card.query_selector(name_sel)
                    if name_el:
                        name = (await name_el.inner_text()).strip()

                if not name:
                    continue

                # Extract website (may be internal article link on editorial sites)
                website = None
                website_sel = selectors.get("website")
                if website_sel:
                    website_el = await card.query_selector(website_sel)
                    if website_el:
                        href = await website_el.get_attribute("href")
                        if href:
                            # Resolve relative URLs to absolute
                            if href.startswith("http"):
                                website = href
                            elif href.startswith("/"):
                                website = urljoin(page.url, href)
                            else:
                                website = href

                # Extract description
                description = None
                desc_sel = selectors.get("description")
                if desc_sel:
                    desc_el = await card.query_selector(desc_sel)
                    if desc_el:
                        description = (await desc_el.inner_text()).strip()

                listings.append({
                    "name": name,
                    "website": website,
                    "description": description,
                })
            except Exception:
                log.debug("industry_listing_extract_failed")
                continue

        return listings

    async def _paginate(self, page, selectors: dict) -> bool:
        """Click next page. Returns False if no more pages."""
        next_sel = selectors.get("next_page")
        if not next_sel:
            return False

        try:
            next_btn = await page.query_selector(next_sel)
            if not next_btn:
                return False

            await smooth_scroll(page, "down", 300)
            await human_pause("reading_short")
            await next_btn.click()
            await human_pause("navigation")

            card_sel = selectors.get("listing_card")
            if card_sel:
                await page.wait_for_selector(card_sel, state="attached", timeout=15000)
            return True
        except Exception:
            return False

    async def _scrape_site(self, page, site_entry: IndustrySiteEntry) -> list[Lead]:
        """Scrape leads from a single industry site."""
        selectors = self._get_selectors(site_entry.name)
        if not selectors:
            return []

        max_results = site_entry.max_results

        if self._shared_dedup:
            known_keys = set()
        else:
            known_keys = get_all_dedup_keys(source="industry_directory")

        leads: list[Lead] = []

        for listing_path in site_entry.listing_paths:
            if len(leads) >= max_results:
                break

            url = urljoin(site_entry.base_url, listing_path)
            log.info("industry_scraping_path", site=site_entry.name, url=url)

            await self._navigate_with_retry(page, url)
            await self._dismiss_consent(page, selectors)
            await human_pause("navigation")

            page_num = 0
            max_pages = 10

            while len(leads) < max_results and page_num < max_pages:
                page_num += 1
                listings = await self._extract_listings(page, selectors)

                if not listings:
                    log.info("no_listings_found", site=site_entry.name, page=page_num)
                    break

                log.info(
                    "industry_listings_extracted",
                    site=site_entry.name,
                    page=page_num,
                    count=len(listings),
                )

                for listing in listings:
                    if len(leads) >= max_results:
                        break

                    name = listing["name"]
                    website = listing.get("website")

                    # Dedup
                    domain = ""
                    if website:
                        try:
                            domain = urlparse(website).netloc.lower().lstrip("www.")
                        except Exception:
                            pass

                    dedup_key = build_dedup_key("industry_directory", name.strip().lower(), domain)
                    if self._shared_dedup:
                        prefix = f"industry_directory|{name.strip().lower()}|"
                        if await self._shared_dedup.contains_prefix(prefix):
                            continue
                    elif any(k.startswith(f"industry_directory|{name.strip().lower()}|") for k in known_keys):
                        continue

                    # Email extraction
                    email = None
                    if website:
                        try:
                            email = await extract_email_from_website(page, website)
                        except Exception:
                            log.warning("industry_email_extraction_failed", website=website)

                    email_domain = email.split("@")[1] if email and "@" in email else None

                    lead = Lead(
                        source=LeadSource.INDUSTRY_DIRECTORY,
                        business_name=name,
                        website=website,
                        email=email,
                        email_found=bool(email),
                        email_domain=email_domain,
                        category=site_entry.name,
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
                        phase="industry",
                        progress=int((len(leads) / max(max_results, 1)) * 90),
                        current_lead=name,
                    )
                    await human_pause("between_listings")

                # Paginate
                if len(leads) < max_results:
                    has_next = await self._paginate(page, selectors)
                    if not has_next:
                        break

        # Batch save in non-parallel mode
        if leads and not self._shared_dedup:
            saved = save_leads(leads)
            log.info("industry_leads_persisted", saved=saved, total=len(leads))

        log.info(
            "industry_site_done",
            site=site_entry.name,
            total=len(leads),
            with_email=sum(1 for l in leads if l.email),
        )
        return leads

    async def scrape(self) -> list[Lead]:
        """Execute industry site scraping across all configured sites."""
        db = get_firestore_client()
        if db is None:
            log.warning("firestore_unavailable_industry")

        headless = self.industry_config.headless
        ctx = await self._launch_browser(headless=headless)

        anchor = await ctx.new_page() if not headless else None

        self._on_progress(phase="warmup", progress=5)
        await warmup_browsing(ctx)

        page = await ctx.new_page()

        if anchor:
            await anchor.close()

        for site_entry in self.industry_config.sites:
            log.info("scraping_industry_site", site=site_entry.name)
            leads = await self._scrape_site(page, site_entry)
            self.collected_leads.extend(leads)
            log.info(
                "industry_site_complete",
                site=site_entry.name,
                found=len(leads),
                total=len(self.collected_leads),
            )

        await page.close()

        log.info(
            "industry_scrape_summary",
            sites=len(self.industry_config.sites),
            total_leads=len(self.collected_leads),
            with_email=sum(1 for l in self.collected_leads if l.email),
        )
        return self.collected_leads


async def main() -> None:
    """CLI entry point for dry-run testing."""
    import argparse

    parser = argparse.ArgumentParser(description="Industry Site Scraper")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--site", type=str, help="Scrape only this site name")
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
    if args.site:
        config.scraping.industry_sites.sites = [
            s for s in config.scraping.industry_sites.sites
            if s.name == args.site
        ]
    config.scraping.industry_sites.headless = args.headless

    scraper = IndustrySiteScraper(config=config)
    log.info("industry_scrape_start", headless=args.headless)

    leads = await scraper.run()

    for lead in leads:
        stage = lead.stage.value
        print(f"  [{stage}] {lead.business_name} | {lead.website} | {lead.email} | src={lead.category}")
    print(f"\nTotal leads: {len(leads)}")


if __name__ == "__main__":
    asyncio.run(main())
