"""Pre-scrape warm-up browsing to build realistic session history.

Visits a few common websites before navigating to Google Maps, creating
a natural browsing pattern and warming up the browser fingerprint.
"""

from __future__ import annotations

import random
from typing import Any

import structlog

from src.scrapers.humanize.scroll import simulate_reading_page
from src.scrapers.humanize.timing import human_pause

log = structlog.get_logger()

WARMUP_SITES = [
    "https://en.wikipedia.org/wiki/Special:Random",
    "https://www.bbc.co.uk/news",
    "https://www.youtube.com",
    "https://www.reddit.com",
    "https://news.ycombinator.com",
    "https://www.theguardian.com",
    "https://weather.com",
    "https://www.imdb.com",
]


async def warmup_browsing(
    context: Any,
    num_sites: int | None = None,
) -> None:
    """Visit random safe sites to warm up the browser session.

    Args:
        context: Playwright browser context
        num_sites: Number of sites to visit (default: random 2-4)
    """
    if num_sites is None:
        num_sites = random.randint(2, 4)

    sites = random.sample(WARMUP_SITES, min(num_sites, len(WARMUP_SITES)))
    log.info("warmup_start", num_sites=len(sites))

    for site in sites:
        page = await context.new_page()
        try:
            await page.goto(site, wait_until="domcontentloaded", timeout=10000)
            log.debug("warmup_visiting", url=site)

            # Simulate reading the page
            await simulate_reading_page(page, min_seconds=2.0, max_seconds=5.0)

            # Pause before closing
            await human_pause("reading_short")

        except Exception:
            log.debug("warmup_site_failed", url=site)
        finally:
            await page.close()

        # Pause between sites
        await human_pause("navigation")

    log.info("warmup_complete", sites_visited=len(sites))
