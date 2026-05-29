"""Selector-drift canary.

Visits each scraper's target site with a known-good test query and confirms
the critical selectors still match. Writes the result to Firestore
`pipeline_jobs` and emails admins if any check fails.

Designed to run on a weekly VPS cron (see docs/specs/scraping-fixes-checklist.md
Fix G). Catches site redesigns (Google Maps, Bing, LinkedIn) BEFORE the next
real scrape returns zero leads.

Usage:
    uv run python -m src.scrapers.canary [--scraper gmaps|bing|gsearch|linkedin|all]
"""

from __future__ import annotations

import argparse
import asyncio
import os
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote_plus

import structlog
from dotenv import load_dotenv

load_dotenv()

from src.scrapers.browser import close_browser, get_proxy_config, launch_browser
from src.scrapers.selectors.bing_selectors import RESULT_CONTAINER as BING_RESULTS
from src.scrapers.selectors.gmaps_selectors import (
    CARD_BUSINESS_NAME_ATTR,
    LISTING_CARDS,
    RESULT_ITEM,
)
from src.scrapers.selectors.gsearch_selectors import (
    RESULT_CONTAINER as GSEARCH_RESULTS,
)

log = structlog.get_logger()


# Stable, high-traffic venues that are extremely unlikely to disappear.
# If these stop matching, the site itself almost certainly changed.
CANARY_QUERIES = {
    "gmaps": "The Connaught Bar London",
    "bing": "London cocktail bars",
    "gsearch": "London cocktail bars",
    "linkedin": "Diageo",
}


@dataclass
class CanaryResult:
    scraper: str
    ok: bool
    detail: str
    elapsed_ms: int


async def _check_gmaps() -> CanaryResult:
    start = datetime.utcnow()
    browser = None
    engine = "camoufox"
    try:
        browser, engine = await launch_browser(headless=True, proxy=get_proxy_config())
        context = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            locale="en-GB",
            timezone_id="Europe/London",
        )
        page = await context.new_page()
        await page.goto(
            f"https://www.google.com/maps/search/{quote_plus(CANARY_QUERIES['gmaps'])}",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        await page.wait_for_selector(LISTING_CARDS, state="attached", timeout=30000)
        cards = await page.query_selector_all(LISTING_CARDS)
        if not cards:
            return CanaryResult("gmaps", False, "No listing cards matched", _ms(start))
        first = cards[0]
        name = await first.get_attribute(CARD_BUSINESS_NAME_ATTR)
        if not name:
            return CanaryResult(
                "gmaps",
                False,
                f"Found {len(cards)} cards but business name attribute ({CARD_BUSINESS_NAME_ATTR}) is empty",
                _ms(start),
            )
        return CanaryResult("gmaps", True, f"OK — {len(cards)} cards, first='{name}'", _ms(start))
    except Exception as exc:
        return CanaryResult("gmaps", False, f"{type(exc).__name__}: {exc}", _ms(start))
    finally:
        if browser:
            try:
                await close_browser(browser, engine)
            except Exception:
                pass


async def _check_bing() -> CanaryResult:
    start = datetime.utcnow()
    browser = None
    engine = "camoufox"
    try:
        browser, engine = await launch_browser(headless=True, proxy=get_proxy_config())
        context = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            locale="en-GB",
            timezone_id="Europe/London",
        )
        page = await context.new_page()
        await page.goto(
            f"https://www.bing.com/search?q={quote_plus(CANARY_QUERIES['bing'])}",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        await page.wait_for_selector(BING_RESULTS, state="attached", timeout=30000)
        results = await page.query_selector_all(BING_RESULTS)
        if not results:
            return CanaryResult("bing", False, "No result containers matched", _ms(start))
        return CanaryResult("bing", True, f"OK — {len(results)} result containers", _ms(start))
    except Exception as exc:
        return CanaryResult("bing", False, f"{type(exc).__name__}: {exc}", _ms(start))
    finally:
        if browser:
            try:
                await close_browser(browser, engine)
            except Exception:
                pass


async def _check_gsearch() -> CanaryResult:
    start = datetime.utcnow()
    browser = None
    engine = "camoufox"
    try:
        browser, engine = await launch_browser(headless=True, proxy=get_proxy_config())
        context = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            locale="en-GB",
            timezone_id="Europe/London",
        )
        page = await context.new_page()
        await page.goto(
            f"https://www.google.com/search?q={quote_plus(CANARY_QUERIES['gsearch'])}",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        await page.wait_for_selector(GSEARCH_RESULTS, state="attached", timeout=30000)
        results = await page.query_selector_all(GSEARCH_RESULTS)
        if not results:
            return CanaryResult("gsearch", False, "No result containers matched", _ms(start))
        return CanaryResult(
            "gsearch", True, f"OK — {len(results)} result containers", _ms(start)
        )
    except Exception as exc:
        return CanaryResult("gsearch", False, f"{type(exc).__name__}: {exc}", _ms(start))
    finally:
        if browser:
            try:
                await close_browser(browser, engine)
            except Exception:
                pass


async def _check_linkedin() -> CanaryResult:
    """LinkedIn canary uses the existing persistent profile + session-valid check.

    Reuses LinkedInCompanyScraper rather than launching its own browser so the
    saved cookies are available and we don't burn proxy IPs unnecessarily.
    """
    start = datetime.utcnow()
    try:
        from src.config.loader import load_config
        from src.scrapers.linkedin import (
            LinkedInBlocked,
            LinkedInCompanyScraper,
            LinkedInSessionExpired,
        )

        scraper = LinkedInCompanyScraper(config=load_config())
        try:
            scraper._ensure_session_exists()
        except LinkedInSessionExpired as exc:
            return CanaryResult("linkedin", False, f"Session expired: {exc}", _ms(start))

        ctx = await scraper._launch_persistent_browser(headless=True)
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        try:
            await scraper._verify_session_valid(page)
            return CanaryResult("linkedin", True, "Session valid", _ms(start))
        except LinkedInSessionExpired as exc:
            return CanaryResult("linkedin", False, f"Session expired mid-check: {exc}", _ms(start))
        except LinkedInBlocked as exc:
            return CanaryResult("linkedin", False, f"Blocked: {exc}", _ms(start))
        finally:
            try:
                await scraper._close_persistent_browser()
            except Exception:
                pass
    except Exception as exc:
        return CanaryResult("linkedin", False, f"{type(exc).__name__}: {exc}", _ms(start))


def _ms(start: datetime) -> int:
    return int((datetime.utcnow() - start).total_seconds() * 1000)


CHECKERS = {
    "gmaps": _check_gmaps,
    "bing": _check_bing,
    "gsearch": _check_gsearch,
    "linkedin": _check_linkedin,
}


def _record_pipeline_job(results: list[CanaryResult]) -> None:
    """Write a single pipeline_jobs entry summarising the canary run."""
    try:
        from src.db.client import get_firestore_client
        db = get_firestore_client()
        if not db:
            return
        now = datetime.utcnow().isoformat() + "Z"
        any_failed = any(not r.ok for r in results)
        db.collection("pipeline_jobs").add({
            "type": "selector_canary",
            "status": "alerted" if any_failed else "ok",
            "started_at": now,
            "completed_at": now,
            "result": {
                "checks": [
                    {
                        "scraper": r.scraper,
                        "ok": r.ok,
                        "detail": r.detail,
                        "elapsed_ms": r.elapsed_ms,
                    }
                    for r in results
                ],
            },
        })
    except Exception as exc:
        log.warning("canary_record_failed", error=str(exc))


def _alert_admins(failed: list[CanaryResult]) -> None:
    """Reuse the existing _send_linkedin_alert helper — same Resend pattern."""
    if not failed:
        return
    try:
        from src.api.routes import _send_linkedin_alert
    except Exception as exc:
        log.warning("canary_alert_import_failed", error=str(exc))
        return

    body_lines = [
        "Selector drift detected — one or more scrapers failed their weekly canary check.",
        "",
        "This usually means the target site has redesigned its layout.",
        "Action: open the affected site manually and update the scraper's selectors.",
        "",
    ]
    for r in failed:
        body_lines.append(f"  {r.scraper}: {r.detail} ({r.elapsed_ms}ms)")
    subject = f"[Asterley] Selector canary FAILED — {', '.join(r.scraper for r in failed)}"
    try:
        _send_linkedin_alert(subject, "\n".join(body_lines))
    except Exception as exc:
        log.warning("canary_alert_send_failed", error=str(exc))


async def _amain(targets: list[str]) -> None:
    if "all" in targets:
        targets = list(CHECKERS.keys())

    results: list[CanaryResult] = []
    for t in targets:
        checker = CHECKERS.get(t)
        if not checker:
            log.warning("canary_unknown_target", target=t)
            continue
        log.info("canary_start", scraper=t)
        result = await checker()
        log.info(
            "canary_done",
            scraper=t,
            ok=result.ok,
            detail=result.detail,
            elapsed_ms=result.elapsed_ms,
        )
        results.append(result)

    _record_pipeline_job(results)
    _alert_admins([r for r in results if not r.ok])

    # Exit code: 0 if all checks passed, 1 otherwise — useful for cron logs.
    failed_count = sum(1 for r in results if not r.ok)
    if failed_count:
        log.warning("canary_summary", total=len(results), failed=failed_count)
        raise SystemExit(1)
    log.info("canary_summary_ok", total=len(results))


def main() -> None:
    parser = argparse.ArgumentParser(description="Selector drift canary")
    parser.add_argument(
        "--scraper",
        type=str,
        default="all",
        help=f"Which checker(s) to run. Comma-separated. Options: {', '.join(CHECKERS.keys())}, all. Default: all.",
    )
    args = parser.parse_args()
    targets = [t.strip() for t in args.scraper.split(",") if t.strip()]
    asyncio.run(_amain(targets))


if __name__ == "__main__":
    main()
