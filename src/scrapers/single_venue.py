"""Scrape a single venue from a user-supplied input.

Supports three input shapes (auto-detected):
  1. Google Maps URL  (https://www.google.com/maps/place/...)
  2. Plain venue name ("The Connaught Bar London")
  3. Website URL      (https://theconnaughtbar.com)

Returns a Lead persisted to Firestore (via the existing atomic claim
mechanism), so dedup with the bulk scrape works transparently.

Designed to be called from the FastAPI `/api/scrape-one` endpoint and run
synchronously — typical end-to-end latency 15-45 seconds.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import structlog

from src.config.loader import load_config
from src.db.firestore import save_lead_immediate
from src.db.models import Lead, LeadSource, PipelineStage
from src.scrapers.gmaps import GoogleMapsScraper
from src.scrapers.humanize.timing import human_pause

log = structlog.get_logger()


@dataclass
class SingleVenueResult:
    """Outcome of a single-venue scrape attempt."""
    lead: Optional[Lead]
    is_new: bool
    detected_kind: str  # "gmaps_url" | "website_url" | "name"
    error: Optional[str] = None


# ----------------------------------------------------- Input detection


_GMAPS_HOSTS = {"google.com", "www.google.com", "maps.google.com", "goo.gl", "maps.app.goo.gl"}


def _detect_input_kind(raw: str) -> str:
    """Return one of: gmaps_url | website_url | name."""
    s = raw.strip()
    if not s:
        return "name"

    # Bare URL or "https://..." form
    parsed = urlparse(s if "://" in s else f"https://{s}")
    host = (parsed.netloc or "").lower()
    path = parsed.path or ""

    if not host or "." not in host:
        return "name"

    if host in _GMAPS_HOSTS:
        if "/maps" in path or host in ("goo.gl", "maps.app.goo.gl"):
            return "gmaps_url"
        # google.com without /maps — treat as name search
        return "name"

    return "website_url"


# ----------------------------------------------------- Scrape one


async def scrape_single_venue(raw_input: str) -> SingleVenueResult:
    """Top-level entry: detect → scrape → persist → return.

    Keeps a single Camoufox process for the run; closes it before return.
    """
    kind = _detect_input_kind(raw_input)
    log.info("scrape_one_start", kind=kind, input=raw_input[:200])

    scraper = GoogleMapsScraper(config=load_config())

    try:
        ctx = await scraper._launch_browser(headless=True)
        page = await ctx.new_page()

        if kind == "gmaps_url":
            lead = await _scrape_from_gmaps_url(scraper, page, raw_input)
        elif kind == "name":
            lead = await _scrape_from_name(scraper, page, raw_input)
        else:
            lead = await _scrape_from_website(scraper, page, raw_input)

        if not lead:
            return SingleVenueResult(lead=None, is_new=False, detected_kind=kind,
                                     error="Could not extract venue details from the input.")

        is_new = save_lead_immediate(lead)
        log.info("scrape_one_done", kind=kind, business=lead.business_name, is_new=is_new)
        return SingleVenueResult(lead=lead, is_new=is_new, detected_kind=kind)

    except Exception as exc:
        log.exception("scrape_one_failed", kind=kind)
        return SingleVenueResult(lead=None, is_new=False, detected_kind=kind, error=str(exc))
    finally:
        try:
            await scraper._close_browser()
        except Exception:
            pass


# ----------------------------------------------------- Per-input-kind implementations


async def _scrape_from_gmaps_url(scraper: GoogleMapsScraper, page, url: str) -> Optional[Lead]:
    """Open the place page directly and extract from the detail panel."""
    target_url = url.strip()
    # goo.gl / maps.app.goo.gl shortlinks resolve via redirect — Playwright follows.
    await scraper._navigate_with_retry(page, target_url)
    await human_pause("navigation")
    await scraper._dismiss_consent(page)

    # Wait for the address panel — same selector the bulk scraper uses.
    from src.scrapers.selectors.gmaps_selectors import DETAIL_SELECTORS
    try:
        await page.wait_for_selector(DETAIL_SELECTORS["address"], state="attached", timeout=30000)
    except Exception:
        log.warning("gmaps_url_address_not_loaded", url=target_url)
        return None

    detail = await scraper._extract_detail(page)
    return _detail_to_lead(detail, LeadSource.GOOGLE_MAPS)


async def _scrape_from_name(scraper: GoogleMapsScraper, page, name: str) -> Optional[Lead]:
    """Search Google Maps for the name, then extract from the first result."""
    await scraper._human_search(page, name)
    from src.scrapers.selectors.gmaps_selectors import LISTING_CARDS, DETAIL_SELECTORS

    # Wait for at least one listing card. If Google jumps straight into a single
    # result detail page (common for an exact venue name), the address selector
    # will already be present.
    try:
        await page.wait_for_selector(LISTING_CARDS, state="attached", timeout=30000)
        first = await page.query_selector(LISTING_CARDS)
        if first is not None:
            href = await first.get_attribute("href")
            if href:
                await scraper._navigate_with_retry(page, href)
                await human_pause("navigation")
                await scraper._dismiss_consent(page)
    except Exception:
        # Maybe we landed directly on a detail page — fall through to extract.
        pass

    try:
        await page.wait_for_selector(DETAIL_SELECTORS["address"], state="attached", timeout=30000)
    except Exception:
        log.warning("name_search_no_detail", name=name)
        return None

    detail = await scraper._extract_detail(page)
    return _detail_to_lead(detail, LeadSource.GOOGLE_MAPS)


async def _scrape_from_website(scraper: GoogleMapsScraper, page, raw_url: str) -> Optional[Lead]:
    """For a bare website URL: derive a likely venue name from the page title
    and look it up on Google Maps to get address/phone/rating."""
    url = raw_url.strip()
    if "://" not in url:
        url = f"https://{url}"

    try:
        await scraper._navigate_with_retry(page, url)
        title = (await page.title() or "").strip()
    except Exception as exc:
        log.warning("website_load_failed", url=url, error=str(exc))
        return None

    # Best-effort: strip common tagline suffixes like " - Cocktail Bar London"
    name_guess = re.split(r"\s[\|\-–—:]\s", title, maxsplit=1)[0].strip() if title else ""
    if not name_guess:
        host = urlparse(url).netloc.removeprefix("www.")
        name_guess = host.split(".")[0].replace("-", " ").title()

    log.info("website_name_inferred", url=url, name=name_guess)

    # Run a name-based gmaps search but stamp the website on the result.
    lead = await _scrape_from_name(scraper, page, name_guess)
    if lead is not None and not lead.website:
        lead.website = url
    return lead


# ----------------------------------------------------- Mapping


def _detail_to_lead(detail: dict, source: LeadSource) -> Optional[Lead]:
    """Convert the raw extracted detail dict into a Lead pydantic model."""
    name = (detail.get("name") or "").strip()
    if not name:
        return None

    return Lead(
        source=source,
        business_name=name,
        address=detail.get("address"),
        phone=detail.get("phone"),
        website=detail.get("website"),
        rating=detail.get("rating"),
        review_count=detail.get("review_count"),
        category=detail.get("category"),
        stage=PipelineStage.SCRAPED,
    )
