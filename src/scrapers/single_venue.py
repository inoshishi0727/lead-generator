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
from urllib.parse import quote_plus, urlparse

import structlog

from src.config.loader import load_config
from src.db.firestore import save_lead_immediate
from src.db.models import Lead, LeadSource, PipelineStage
from src.scrapers.gmaps import GoogleMapsScraper
from src.scrapers.humanize.timing import human_pause

# Enrichment + scoring are imported lazily inside the helper so the module
# load cost is only paid for /scrape-one calls (not other API paths).

log = structlog.get_logger()


@dataclass
class SingleVenueResult:
    """Outcome of a single-venue scrape attempt."""
    lead: Optional[Lead]
    is_new: bool
    detected_kind: str  # "gmaps_url" | "website_url" | "name"
    enriched: bool = False
    scored: bool = False
    error: Optional[str] = None


# ----------------------------------------------------- Input detection


_GMAPS_HOSTS = {"google.com", "www.google.com", "maps.google.com", "goo.gl", "maps.app.goo.gl"}


_LIST_PREFIX_RE = re.compile(r"^\s*(?:\d+\s*[\.\):]\s*|[\-\*•]\s+|\*\*)+\s*")

# Google Maps place id embedded in the place URL (same pattern the bulk scraper
# reads off listing cards). Captured so single-venue re-scrapes carry the stable
# id the deterministic dedup key relies on.
_PLACE_ID_RE = re.compile(r"!1s(0x[0-9a-f]+:[0-9a-fx]+)", re.IGNORECASE)


def _extract_place_id_from_url(url: str | None) -> Optional[str]:
    """Pull the stable Google Maps place id out of a place URL, if present."""
    if not url:
        return None
    m = _PLACE_ID_RE.search(url)
    if not m:
        m = re.search(r"place_id[=:]([A-Za-z0-9_-]+)", url)
    return m.group(1) if m else None


def _normalize_input(raw: str) -> str:
    """Strip list-style prefixes a user might paste from notes / emails.

    Examples that should all map to "Best Wines (London)":
      "3. Best Wines (London)"
      "- Best Wines (London)"
      "  • Best Wines (London) "
      "**Best Wines (London)**"
    """
    s = raw.strip()
    # Strip leading "3. ", "- ", "• ", "**" etc.
    s = _LIST_PREFIX_RE.sub("", s)
    # Markdown bold markers are never part of a venue name; drop them everywhere.
    s = s.replace("**", "")
    # Drop a stray leading "." like ". BWH Drinks"
    s = re.sub(r"^\.\s+", "", s).strip()
    return s


def _detect_input_kind(raw: str) -> str:
    """Return one of: gmaps_url | website_url | name."""
    s = raw.strip()
    if not s:
        return "name"

    # Must look enough like a URL to bother parsing.
    has_scheme = "://" in s
    looks_like_host = bool(re.match(r"^[a-z0-9][a-z0-9\-]*(?:\.[a-z0-9][a-z0-9\-]*)+(?:/|$)", s, re.IGNORECASE))
    if not has_scheme and not looks_like_host:
        return "name"

    parsed = urlparse(s if has_scheme else f"https://{s}")
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


def _is_unsupported_gmaps_path(url: str) -> Optional[str]:
    """Return a user-facing error message if the URL is a Maps URL we can't
    extract a single venue from (directions, search results, etc.). None means
    the URL is usable."""
    path = (urlparse(url).path or "").lower()
    if "/maps/dir" in path:
        return "That's a Google Maps directions link — please paste the venue's place page instead (click the venue, then Share)."
    if "/maps/search" in path:
        return "That's a Google Maps search-results page — please open the venue and share its place page."
    return None


def _shorten_name_for_search(raw: str) -> str:
    """Clean and trim a venue name for Google Maps search.

    - First chops at comma so long pasted addresses don't get typed in full.
    - Removes parenthesised disambiguation that often confuses Google
      Maps's search ranking ("Best Wines (London)" → "Best Wines London").
    - Caps length at 80 chars.
    """
    first = raw.split(",")[0].strip()
    # Pull parenthetical content out and append as plain words so we don't
    # lose the locality hint, e.g. "Best Wines (London)" → "Best Wines London"
    paren_bits = re.findall(r"\(([^)]+)\)", first)
    cleaned = re.sub(r"\s*\([^)]*\)", "", first).strip()
    if paren_bits:
        cleaned = (cleaned + " " + " ".join(paren_bits)).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:80] if len(cleaned) > 80 else cleaned


# ----------------------------------------------------- Scrape one


async def scrape_single_venue(raw_input: str, on_step=None) -> SingleVenueResult:
    """Top-level entry: detect → scrape → persist → return.

    Keeps a single Camoufox process for the run; closes it before return.
    `on_step(msg)` surfaces live progress (resolve → enrich sub-steps) to the UI.
    """
    cleaned_input = _normalize_input(raw_input)
    if not cleaned_input:
        return SingleVenueResult(lead=None, is_new=False, detected_kind="name",
                                 error="Input is empty after cleanup.")

    kind = _detect_input_kind(cleaned_input)
    log.info("scrape_one_start", kind=kind, raw=raw_input[:120], cleaned=cleaned_input[:120])

    # Reject Google Maps URLs we can't extract from before launching a browser.
    if kind == "gmaps_url":
        unsupported = _is_unsupported_gmaps_path(cleaned_input)
        if unsupported:
            return SingleVenueResult(lead=None, is_new=False, detected_kind=kind, error=unsupported)

    scraper = GoogleMapsScraper(config=load_config())

    try:
        ctx = await scraper._launch_browser(headless=True)
        page = await ctx.new_page()

        if kind == "gmaps_url":
            lead = await _scrape_from_gmaps_url(scraper, page, cleaned_input)
        elif kind == "name":
            lead = await _scrape_from_name(scraper, page, cleaned_input)
        else:
            lead = await _scrape_from_website(scraper, page, cleaned_input)

        if not lead:
            return SingleVenueResult(lead=None, is_new=False, detected_kind=kind,
                                     error="Could not extract venue details from the input.")

        # Persist immediately so a downstream enrichment failure doesn't lose the
        # base record. is_new=False on duplicate; we still try to enrich.
        is_new = save_lead_immediate(lead)
        log.info("scrape_one_saved", kind=kind, business=lead.business_name, is_new=is_new)

        # Enrich + score in the same request. Failures here are non-fatal — the
        # base lead is already saved.
        enriched, scored = await _enrich_and_score(
            lead, log_prefix=lead.business_name, on_step=on_step)
        if enriched or scored:
            try:
                from src.db.firestore import update_lead as _update_lead
                _update_lead(str(lead.id), lead.model_dump(mode="json", exclude_none=True))
            except Exception as exc:
                log.warning("scrape_one_update_failed", error=str(exc))

        return SingleVenueResult(
            lead=lead, is_new=is_new, detected_kind=kind,
            enriched=enriched, scored=scored,
        )

    except Exception as exc:
        log.exception("scrape_one_failed", kind=kind)
        return SingleVenueResult(lead=None, is_new=False, detected_kind=kind, error=str(exc))
    finally:
        try:
            await scraper._close_browser()
        except Exception:
            pass


async def resolve_gmaps_details(name: str) -> Optional[Lead]:
    """Resolve a venue's Google Maps details (website, rating, review_count,
    category, address, phone, place_id) by name — WITHOUT saving, enriching or
    scoring. Enrichment uses this to discover a missing website + Maps signals
    (Maps has the authority website link even when the site-crawler can't find
    it). Returns a Lead carrying only the GMaps-derived fields, or None.

    Kept separate from `scrape_single_venue` (which persists + enriches) to avoid
    recursion when called from inside `EnrichmentEngine.enrich_lead`.
    """
    cleaned = _normalize_input(name)
    if not cleaned:
        return None
    scraper = GoogleMapsScraper(config=load_config())
    try:
        ctx = await scraper._launch_browser(headless=True)
        page = await ctx.new_page()
        return await _scrape_from_name(scraper, page, cleaned)
    except Exception as exc:
        log.warning("gmaps_resolve_failed", name=cleaned[:80], error=str(exc))
        return None
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
        await page.wait_for_selector(DETAIL_SELECTORS["address"], state="attached", timeout=20000)
    except Exception:
        log.warning("gmaps_url_address_not_loaded", url=target_url)
        return None

    detail = await scraper._extract_detail(page)
    place_id = _extract_place_id_from_url(page.url)
    return _detail_to_lead(detail, LeadSource.GOOGLE_MAPS, place_id)


async def _scrape_from_name(scraper: GoogleMapsScraper, page, name: str) -> Optional[Lead]:
    """Search Google Maps for the name, then extract from the first result.

    Uses a direct /maps/search/ URL rather than typing into the search box —
    faster and more reliable for long inputs (pasted addresses etc.).
    """
    from src.scrapers.selectors.gmaps_selectors import LISTING_CARDS, DETAIL_SELECTORS

    cleaned = _shorten_name_for_search(name)
    if not cleaned:
        return None
    search_url = f"https://www.google.com/maps/search/{quote_plus(cleaned)}"

    await scraper._navigate_with_retry(page, search_url)
    await human_pause("navigation")
    await scraper._dismiss_consent(page)

    # Wait for either a listing card OR an address panel. The former means we got
    # a list of results; the latter means Google redirected us straight to the venue.
    try:
        await page.wait_for_selector(LISTING_CARDS, state="attached", timeout=20000)
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
        await page.wait_for_selector(DETAIL_SELECTORS["address"], state="attached", timeout=20000)
    except Exception:
        log.warning("name_search_no_detail", name=cleaned)
        return None

    detail = await scraper._extract_detail(page)
    place_id = _extract_place_id_from_url(page.url)
    return _detail_to_lead(detail, LeadSource.GOOGLE_MAPS, place_id)


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


async def _enrich_and_score(lead: Lead, log_prefix: str = "", on_step=None) -> tuple[bool, bool]:
    """Run enrichment then scoring on a single lead, in-place.

    Returns (enriched, scored) flags. Both are best-effort: an exception in
    either stage is logged and swallowed so the saved Lead survives.
    `on_step(msg)` surfaces live enrichment progress to the scrape UI.
    """
    enriched = False
    scored = False

    try:
        from src.enrichment.engine import EnrichmentEngine
        engine = EnrichmentEngine()
        await engine.enrich_lead(lead, on_step=on_step)
        enriched = True
        log.info("scrape_one_enriched", business=log_prefix)
    except Exception as exc:
        log.warning("scrape_one_enrich_failed", business=log_prefix, error=str(exc))

    try:
        from src.scoring.engine import ScoringEngine
        scoring = ScoringEngine()
        scoring.score_leads([lead])
        scored = True
        log.info("scrape_one_scored", business=log_prefix, score=lead.score)
    except Exception as exc:
        log.warning("scrape_one_score_failed", business=log_prefix, error=str(exc))

    return enriched, scored


def _detail_to_lead(
    detail: dict, source: LeadSource, place_id: Optional[str] = None
) -> Optional[Lead]:
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
        google_maps_place_id=place_id,
        stage=PipelineStage.SCRAPED,
    )
