"""Google Maps scraper using Camoufox + Playwright.

Batched strategy:
  1. Scroll feed, collect card-level data (name + URL).
  2. Process cards in batches — click into each, extract details + email.
  3. Check email yield per batch; paginate for more if yield is low.
  4. Leads without email are marked NEEDS_EMAIL for manual review.
"""

from __future__ import annotations

import asyncio
import re
from urllib.parse import urlencode

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
from src.scrapers.selectors.gmaps_selectors import (
    BACK_BUTTON,
    CARD_BUSINESS_NAME_ATTR,
    DETAIL_SELECTORS,
    END_OF_LIST,
    LISTING_CARDS,
    RESULT_ITEM,
    SCROLL_FEED_JS,
)

log = structlog.get_logger()


class GoogleMapsScraper(BaseScraper):
    """Scrapes venue leads from Google Maps search results."""

    def __init__(
        self,
        config: AppConfig | None = None,
        on_progress: callable | None = None,
        shared_dedup: SharedDedupSet | None = None,
        skip_gmaps_types: set[str] | None = None,
    ) -> None:
        super().__init__(config)
        self.gmaps_config = self.config.scraping.google_maps
        self.collected_leads: list[Lead] = []
        self._on_progress = on_progress or (lambda **kw: None)
        self._shared_dedup = shared_dedup
        self._skip_gmaps_types = skip_gmaps_types or set()

    def _maps_home_url(self) -> str:
        """Google Maps homepage URL with locale."""
        params = urlencode({"hl": self.gmaps_config.locale})
        return f"https://www.google.com/maps?{params}"

    async def _human_search(self, page, query: str) -> None:
        """Navigate to Google Maps and type the search query like a human."""
        # Go to Maps homepage
        await self._navigate_with_retry(page, self._maps_home_url())

        # Dismiss consent — may need multiple attempts
        await self._dismiss_consent(page)
        await human_pause("navigation")
        await self._dismiss_consent(page)

        # Find the search box — try multiple selectors
        search_box = None
        selectors = ["#searchboxinput", "input[name='q']", "[aria-label='Search Google Maps']"]
        for sel in selectors:
            try:
                search_box = await page.wait_for_selector(sel, state="visible", timeout=8000)
                if search_box:
                    log.debug("search_box_found", selector=sel)
                    break
            except Exception:
                continue

        if not search_box:
            # Last resort: take a screenshot for debugging then raise
            try:
                await page.screenshot(path="data/debug_searchbox_fail.png")
            except Exception:
                pass
            raise ScraperError("Could not find Google Maps search box")

        await search_box.click()
        await quick_pause()

        # Type the query with human-like delays
        for char in query:
            await page.keyboard.type(char, delay=50 + (hash(char) % 80))
        await human_pause("after_click")

        # Press Enter to search
        await page.keyboard.press("Enter")
        await human_pause("navigation")

    # ------------------------------------------------------------------
    # Google consent dialog
    # ------------------------------------------------------------------

    async def _dismiss_consent(self, page) -> None:
        """Detect and dismiss the Google cookie consent dialog if present."""
        # Check if consent page is showing
        try:
            content = await page.text_content("body", timeout=2000)
        except Exception:
            return

        if not content:
            return

        consent_markers = [
            "Before you continue",
            "Bevor du fortfährst",
            "Avant de continuer",
            "Antes de continuar",
        ]
        if not any(marker in content for marker in consent_markers):
            return

        log.info("consent_dialog_detected")

        # Try clicking accept button
        accept_selectors = [
            "button:has-text('Accept all')",
            "button:has-text('Alle akzeptieren')",
            "button:has-text('Accepter tout')",
            "button:has-text('Aceptar todo')",
            "[aria-label='Accept all']",
        ]
        for selector in accept_selectors:
            try:
                btn = await page.query_selector(selector)
                if btn:
                    await btn.click()
                    log.info("consent_dismissed", selector=selector)
                    await page.wait_for_load_state("domcontentloaded", timeout=5000)
                    return
            except Exception:
                continue

        log.warning("consent_dialog_not_dismissed")

    # ------------------------------------------------------------------
    # Pass 1: Feed scrolling
    # ------------------------------------------------------------------

    async def _scroll_feed(self, page, min_cards: int = 0) -> list[dict]:
        """Scroll the results feed and collect card data.

        Args:
            page: Playwright page on Google Maps results.
            min_cards: If > 0, stop scrolling once at least this many cards
                are visible (used for incremental pagination).
        """
        stale_count = 0
        previous_count = 0

        while True:
            await page.evaluate(SCROLL_FEED_JS)
            await human_pause("reading_short")
            await smooth_scroll(page, "down", 200)

            # Check for end of results
            end_marker = await page.query_selector(END_OF_LIST)
            if end_marker:
                log.info("feed_end_reached")
                break

            elements = await page.query_selector_all(LISTING_CARDS)
            current_count = len(elements)

            # Stop early if we have enough cards for this batch
            if min_cards > 0 and current_count >= min_cards:
                log.info("feed_min_cards_reached", count=current_count, target=min_cards)
                break

            if current_count == previous_count:
                stale_count += 1
                if stale_count >= self.gmaps_config.max_stale_rounds:
                    log.info("feed_stale_stop", count=current_count)
                    break
            else:
                stale_count = 0

            previous_count = current_count

        # Extract card-level data, dedup by name
        elements = await page.query_selector_all(LISTING_CARDS)
        cards = []
        seen_names: set[str] = set()
        for el in elements:
            name = await el.get_attribute(CARD_BUSINESS_NAME_ATTR)
            href = await el.get_attribute("href")
            if name and href:
                name_key = name.strip().lower()
                if name_key not in seen_names:
                    seen_names.add(name_key)
                    cards.append({"name": name.strip(), "href": href})

        log.info("feed_cards_collected", count=len(cards))
        return cards

    # ------------------------------------------------------------------
    # Pass 2: Detail extraction
    # ------------------------------------------------------------------

    async def _extract_detail(self, page) -> dict:
        """Extract detail fields from an open listing panel."""
        detail = {}

        for field, selector in DETAIL_SELECTORS.items():
            try:
                el = await page.query_selector(selector)
                if el is None:
                    continue

                if field == "name":
                    detail[field] = (await el.inner_text()).strip()
                elif field == "website":
                    detail[field] = await el.get_attribute("href")
                elif field == "phone":
                    data_id = await el.get_attribute("data-item-id")
                    if data_id and data_id.startswith("phone:"):
                        detail[field] = data_id.replace("phone:", "").strip()
                else:
                    detail[field] = (await el.inner_text()).strip()
            except Exception:
                log.warning("detail_extract_failed", field=field)

        # Parse rating and review count from aria-label
        rating_el = await page.query_selector(DETAIL_SELECTORS["rating"])
        if rating_el:
            label = await rating_el.get_attribute("aria-label") or ""
            rating_match = re.search(r"([\d.]+)\s*star", label)
            review_match = re.search(r"([\d,]+)\s*review", label)
            if rating_match:
                detail["rating"] = float(rating_match.group(1))
            if review_match:
                detail["review_count"] = int(review_match.group(1).replace(",", ""))

        return detail

    # ------------------------------------------------------------------
    # Batch processing
    # ------------------------------------------------------------------

    async def _process_batch(
        self,
        page,
        cards: list[dict],
        known_keys: set[str],
        batch_num: int,
        total_leads_so_far: int,
    ) -> list[Lead]:
        """Process a batch of cards: click, extract detail + email, build leads.

        Returns list of leads from this batch.
        """
        leads: list[Lead] = []

        consecutive_failures = 0
        max_consecutive_failures = 5
        debug_screenshot_saved = False

        for i, card in enumerate(cards):
            # Progress reporting
            pct = 25 + int(((total_leads_so_far + i) / max(self.gmaps_config.target_count, 1)) * 65)
            self._on_progress(
                phase=f"batch_{batch_num}",
                progress=min(pct, 90),
                cards_found=total_leads_so_far + len(cards),
                leads_found=total_leads_so_far + len(leads),
                current_lead=card["name"],
            )

            # Dedup check — use shared dedup set if available (parallel mode)
            key_prefix = f"google_maps|{card['name'].strip().lower()}|"
            if self._shared_dedup:
                if await self._shared_dedup.contains_prefix(key_prefix):
                    log.debug("lead_already_known", name=card["name"])
                    continue
            elif any(k.startswith(key_prefix) for k in known_keys):
                log.debug("lead_already_known", name=card["name"])
                continue

            # Click into listing
            try:
                await quick_pause()

                await self._navigate_with_retry(page, card['href'])
                await human_pause("navigation")
                await self._dismiss_consent(page)

                await page.wait_for_selector(
                    DETAIL_SELECTORS["address"], state="attached", timeout=10000
                )

                detail = await self._extract_detail(page)

                # Skip if Google Maps category matches a type we already have enough of
                gmaps_cat = (detail.get("category") or "").lower()
                if gmaps_cat and self._skip_gmaps_types:
                    if any(skip.lower() in gmaps_cat for skip in self._skip_gmaps_types):
                        log.info("skipping_full_category", name=card["name"], gmaps_category=gmaps_cat)
                        continue

                # Email extraction: try website if available
                email = None
                website = detail.get("website")
                if website:
                    try:
                        email = await extract_email_from_website(page, website)
                    except Exception:
                        log.warning("email_extraction_failed", website=website)

                # Extract place_id from Google Maps URL
                place_id = None
                href = card.get("href", "")
                if "place/" in href:
                    # URL format: /maps/place/Name/data=...
                    # or contains !1s prefix for place IDs
                    import re as _re
                    pid_match = _re.search(r"!1s(0x[a-f0-9]+:[a-f0-9x]+)", href)
                    if not pid_match:
                        pid_match = _re.search(r"place_id[=:]([A-Za-z0-9_-]+)", href)
                    if pid_match:
                        place_id = pid_match.group(1)

                # Parse postcode and city from address
                address_str = detail.get("address", "") or ""
                postcode = None
                city = None
                area = None
                if address_str:
                    pc_match = re.search(
                        r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b",
                        address_str,
                        re.IGNORECASE,
                    )
                    if pc_match:
                        postcode = pc_match.group(1).upper()
                    # City: usually "London" for our target area
                    if "london" in address_str.lower():
                        city = "London"
                    # Area: text before postcode or first part of address
                    parts = [p.strip() for p in address_str.split(",")]
                    if len(parts) >= 2:
                        area = parts[-2] if len(parts) >= 3 else parts[0]

                # Email domain
                email_domain = email.split("@")[1] if email and "@" in email else None

                lead = Lead(
                    source=LeadSource.GOOGLE_MAPS,
                    business_name=detail.get("name", card["name"]),
                    address=detail.get("address"),
                    phone=detail.get("phone"),
                    website=website,
                    email=email,
                    email_found=bool(email),
                    rating=detail.get("rating"),
                    review_count=detail.get("review_count"),
                    category=detail.get("category"),
                    google_maps_place_id=place_id,
                    location_postcode=postcode,
                    location_city=city,
                    location_area=area,
                    email_domain=email_domain,
                    stage=PipelineStage.SCRAPED if email else PipelineStage.NEEDS_EMAIL,
                )
                consecutive_failures = 0

                # Record dedup key and save lead immediately
                dedup_key = build_dedup_key(
                    "google_maps",
                    lead.business_name,
                    lead.address,
                )

                if self._shared_dedup:
                    # Parallel mode: atomic check-and-add via shared set
                    is_new = await self._shared_dedup.check_and_add(dedup_key)
                    if not is_new:
                        log.debug("lead_dedup_race", name=lead.business_name)
                        continue
                    # Save to Firestore immediately
                    save_lead_immediate(lead)
                else:
                    known_keys.add(dedup_key)

                record_dedup_key(dedup_key)
                leads.append(lead)

            except Exception as exc:
                consecutive_failures += 1
                log.warning(
                    "listing_scrape_failed",
                    name=card["name"],
                    error=str(exc),
                    consecutive_failures=consecutive_failures,
                )

                # Save debug screenshot on first failure
                if not debug_screenshot_saved:
                    try:
                        await page.screenshot(path="data/debug_listing_fail.png")
                        log.info("debug_screenshot_saved", path="data/debug_listing_fail.png")
                        debug_screenshot_saved = True
                    except Exception:
                        pass

                # After 3 consecutive failures, attempt page recovery
                if consecutive_failures == 3:
                    log.warning("attempting_page_recovery", failures=3)
                    try:
                        await page.reload(wait_until="domcontentloaded", timeout=15000)
                        await self._dismiss_consent(page)
                        consecutive_failures = 0  # Reset after recovery
                        log.info("page_recovery_succeeded")
                    except Exception:
                        log.warning("page_recovery_failed")

                # Abort if session is degraded beyond recovery
                if consecutive_failures >= max_consecutive_failures:
                    log.warning(
                        "session_degraded_aborting_batch",
                        consecutive_failures=consecutive_failures,
                        leads_so_far=len(leads),
                    )
                    break

            await human_pause("between_listings")

        emails_found = sum(1 for lead in leads if lead.email)
        log.info(
            "batch_complete",
            batch=batch_num,
            leads=len(leads),
            emails=emails_found,
        )
        return leads

    # ------------------------------------------------------------------
    # Main query scrape — batched flow
    # ------------------------------------------------------------------

    async def _scrape_query(self, page, query: str) -> list[Lead]:
        """Scrape leads for a single search query.

        Flow:
          1. Scroll feed, collect cards, dedup against known leads.
          2. Process first target_count cards (extract details + email).
          3. If no emails found → paginate for more cards in smaller batches.
          4. If still no emails → mark remaining as NEEDS_EMAIL and stop.
        """
        # Navigate to Maps and type search like a human
        await self._human_search(page, query)

        # Wait for results — try article items first, fall back to listing links
        try:
            await page.wait_for_selector(RESULT_ITEM, state="attached", timeout=20000)
        except Exception:
            # Consent may have appeared after initial load
            await self._dismiss_consent(page)
            log.warning("result_item_not_found_trying_listing_cards")
            try:
                await page.wait_for_selector(LISTING_CARDS, state="attached", timeout=10000)
            except Exception:
                try:
                    await page.screenshot(path="data/debug_gmaps_fail.png")
                    log.error("results_not_found_screenshot_saved", path="data/debug_gmaps_fail.png")
                except Exception:
                    pass
                raise

        # Selector health-check: verify expected DOM elements exist
        test_article = await page.query_selector(RESULT_ITEM)
        test_link = await page.query_selector(LISTING_CARDS)
        if not test_article and not test_link:
            log.error(
                "gmaps_dom_structure_changed",
                query=query,
                hint="Neither div[role='article'] nor a[href*='/maps/place/'] found. Selectors may need updating.",
            )
            try:
                await page.screenshot(path="data/debug_dom_check.png")
                log.info("debug_screenshot_saved", path="data/debug_dom_check.png")
            except Exception:
                pass
            return []

        target = self.gmaps_config.target_count
        pagination_size = self.gmaps_config.pagination_batch_size
        max_rounds = self.gmaps_config.max_pagination_rounds

        # Pass 1: scroll and collect cards
        self._on_progress(phase="scrolling", progress=15)
        all_cards = await self._scroll_feed(page)
        self._on_progress(phase="scrolling", progress=25, cards_found=len(all_cards))

        if not all_cards:
            log.warning(
                "zero_cards_from_feed",
                query=query,
                hint="Google Maps selectors may be outdated or page did not load correctly",
            )
            return []

        # Load combined dedup keys — shared set in parallel mode, local otherwise
        if self._shared_dedup:
            known_keys = set()  # Not used directly in parallel mode
        else:
            known_keys = get_all_dedup_keys(source="google_maps")
            log.info(
                "dedup_set_loaded",
                total_keys=len(known_keys),
                sample=list(known_keys)[:3] if known_keys else [],
            )

        async def _filter_new(cards):
            new = []
            for c in cards:
                prefix = f"google_maps|{c['name'].strip().lower()}|"
                if self._shared_dedup:
                    if not await self._shared_dedup.contains_prefix(prefix):
                        new.append(c)
                else:
                    if not any(k.startswith(prefix) for k in known_keys):
                        new.append(c)
            return new

        new_cards = await _filter_new(all_cards)
        log.info(
            "cards_after_dedup",
            total=len(all_cards),
            new=len(new_cards),
            skipped=len(all_cards) - len(new_cards),
        )

        if not new_cards:
            log.warning(
                "all_cards_filtered_by_dedup",
                total_cards=len(all_cards),
                dedup_keys=len(known_keys) if not self._shared_dedup else self._shared_dedup.size,
                hint="All scraped cards already exist in dedup set. Run with fresh data or clear seen_leads.json.",
            )

        all_leads: list[Lead] = []
        cards_offset = 0

        # --- Round 1: process first target_count cards ---
        first_batch = new_cards[:target]
        if first_batch:
            batch_leads = await self._process_batch(
                page, first_batch, known_keys,
                batch_num=1, total_leads_so_far=0,
            )
            all_leads.extend(batch_leads)
            cards_offset = len(first_batch)

            if not batch_leads:
                log.warning(
                    "zero_leads_from_batch",
                    batch_num=1,
                    cards_attempted=len(first_batch),
                    hint="All cards in first batch failed to extract. Check listing selectors or network.",
                )

        total_emails = sum(1 for l in all_leads if l.email)
        log.info(
            "first_batch_complete",
            leads=len(all_leads),
            emails=total_emails,
            target=target,
        )

        # --- Pagination rounds: keep going until emails >= target ---
        round_num = 1
        while total_emails < target and round_num <= max_rounds:
            round_num += 1
            log.info(
                "paginating_for_more_emails",
                round=round_num,
                emails_found=total_emails,
                target=target,
            )

            # Try remaining collected cards first
            batch_cards = new_cards[cards_offset:cards_offset + pagination_size]

            # If exhausted, scroll for more
            if not batch_cards:
                self._on_progress(phase="scrolling_more", progress=30)
                all_cards = await self._scroll_feed(
                    page, min_cards=cards_offset + pagination_size,
                )
                new_cards = await _filter_new(all_cards)
                batch_cards = new_cards[cards_offset:cards_offset + pagination_size]

            if not batch_cards:
                log.info("no_more_cards_available", round=round_num)
                break

            batch_leads = await self._process_batch(
                page, batch_cards, known_keys,
                batch_num=round_num, total_leads_so_far=len(all_leads),
            )
            all_leads.extend(batch_leads)
            cards_offset += len(batch_cards)

            total_emails = sum(1 for l in all_leads if l.email)
            log.info(
                "pagination_round_done",
                round=round_num,
                emails_found=total_emails,
                target=target,
            )

        # --- Save leads to Firestore (batch mode only; parallel mode saves immediately) ---
        if all_leads and not self._shared_dedup:
            saved = save_leads(all_leads)
            log.info("leads_persisted_to_firestore", saved=saved, total=len(all_leads))

        needs_email = sum(1 for l in all_leads if l.stage == PipelineStage.NEEDS_EMAIL)
        log.info(
            "query_scrape_done",
            total=len(all_leads),
            with_email=total_emails,
            needs_email=needs_email,
        )

        return all_leads

    # ------------------------------------------------------------------
    # Full lifecycle
    # ------------------------------------------------------------------

    async def scrape(self) -> list[Lead]:
        """Execute full Google Maps scraping across all search queries."""
        # Check Firestore connectivity upfront
        db = get_firestore_client()
        if db is None:
            log.warning(
                "firestore_unavailable",
                hint="Leads will NOT be persisted to Firestore. Dedup relies on local JSON only.",
            )

        headless = self.gmaps_config.headless
        ctx = await self._launch_browser(headless=headless)

        anchor = await ctx.new_page() if not headless else None

        self._on_progress(phase="warmup", progress=5)
        await warmup_browsing(ctx)

        page = await ctx.new_page()

        if anchor:
            await anchor.close()

        # Pre-dismiss Google consent before scraping
        try:
            await page.goto("https://www.google.com/maps", wait_until="domcontentloaded", timeout=15000)
            await self._dismiss_consent(page)
        except Exception:
            log.warning("pre_consent_check_failed")

        for query in self.gmaps_config.search_queries:
            log.info("scraping_query", query=query)
            self._on_progress(phase="scrolling", progress=15)
            leads = await self._scrape_query(page, query)
            self.collected_leads.extend(leads)
            log.info(
                "query_complete",
                query=query,
                found=len(leads),
                total=len(self.collected_leads),
            )

        await page.close()

        # Prioritize leads with emails, then trim to target count
        self.collected_leads.sort(
            key=lambda l: (l.email is None, l.business_name)
        )

        # Summary logging — always visible regardless of outcome
        log.info(
            "scrape_summary",
            queries=len(self.gmaps_config.search_queries),
            total_leads=len(self.collected_leads),
            with_email=sum(1 for l in self.collected_leads if l.email),
            without_email=sum(1 for l in self.collected_leads if not l.email),
            firestore_available=get_firestore_client() is not None,
        )

        return self.collected_leads[: self.gmaps_config.target_count]


async def main() -> None:
    """CLI entry point for dry-run testing."""
    import argparse
    import csv
    from datetime import datetime
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Google Maps Scraper")
    parser.add_argument("--dry-run", action="store_true", help="Run without saving to DB")
    parser.add_argument("--headless", action="store_true", help="Run browser headless")
    parser.add_argument("--query", type=str, help="Override search query (single)")
    parser.add_argument("--limit", type=int, default=10, help="Max leads to collect")
    parser.add_argument("--out", type=str, default="leads.csv", help="Output CSV path")
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
        config.scraping.google_maps.search_queries = [args.query]
    config.scraping.google_maps.headless = args.headless
    config.scraping.google_maps.target_count = args.limit

    scraper = GoogleMapsScraper(config=config)
    log.info("mvp_scrape_start", headless=args.headless, limit=args.limit)

    # Log scrape run to Firestore
    from src.db.firestore import save_scrape_run, update_scrape_run
    from src.db.models import LeadSource, RunStatus, ScrapeRun

    query_str = args.query or ", ".join(config.scraping.google_maps.search_queries)
    run = ScrapeRun(
        source=LeadSource.GOOGLE_MAPS,
        query=query_str[:200],
        status=RunStatus.RUNNING,
    )
    save_scrape_run(run)

    try:
        leads = await scraper.run()
        update_scrape_run(str(run.id), {
            "status": "completed",
            "leads_found": len(leads),
            "leads_new": sum(1 for l in leads if l.email),
            "completed_at": datetime.now().isoformat(),
        })
    except Exception as exc:
        update_scrape_run(str(run.id), {
            "status": "failed",
            "error": str(exc)[:500],
            "completed_at": datetime.now().isoformat(),
        })
        raise

    # Print summary
    for lead in leads:
        stage = lead.stage.value
        print(f"  [{stage}] {lead.business_name} | {lead.address} | {lead.website} | {lead.email}")
    print(f"\nTotal leads: {len(leads)}")
    print(f"  With email: {sum(1 for l in leads if l.email)}")
    print(f"  Needs email: {sum(1 for l in leads if not l.email)}")

    # Write CSV
    if leads:
        out_path = Path(args.out)
        fields = ["business_name", "address", "phone", "website", "email", "rating", "review_count", "category", "stage"]
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
