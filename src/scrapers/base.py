"""Abstract base scraper with retry, rate limiting, and browser lifecycle."""

from __future__ import annotations

import abc
import asyncio
import os
from typing import Any

import structlog
from dotenv import load_dotenv

load_dotenv()
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.config.loader import AppConfig, load_config
from src.db.models import Lead
from src.scrapers.humanize.mouse import move_mouse_human_like
from src.scrapers.humanize.timing import (
    human_pause,
    initialize_session_personality,
    quick_pause,
)

log = structlog.get_logger()


class ScraperError(Exception):
    """Base exception for scraper errors."""


class BaseScraper(abc.ABC):
    """Abstract base class for all scrapers."""

    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or load_config()
        self._browser = None
        self._browser_engine = "camoufox"
        self._context = None

    async def _launch_browser(self, headless: bool = True) -> Any:
        """Launch a stealth browser with proxy. Camoufox first, CloakBrowser fallback."""
        from src.scrapers.browser import close_browser, get_proxy_config, launch_browser

        self._browser, self._browser_engine = await launch_browser(headless=headless)

        proxy = get_proxy_config()
        context_kwargs = {
            "viewport": {"width": 1280, "height": 720},
            "locale": "en-GB",
            "timezone_id": "Europe/London",
            "geolocation": {"latitude": 51.5074, "longitude": -0.1278},
            "permissions": ["geolocation"],
        }
        if proxy:
            context_kwargs["proxy"] = proxy
        self._context = await self._browser.new_context(**context_kwargs)

        # Initialize session personality for humanized behavior
        initialize_session_personality(speed="normal", focus="normal", fatigue="low")

        log.info("browser_ready", scraper=self.__class__.__name__, engine=self._browser_engine, proxy=bool(proxy))
        return self._context

    async def _close_browser(self) -> None:
        """Close the browser instance."""
        from src.scrapers.browser import close_browser

        if self._context:
            await self._context.close()
        if self._browser:
            await close_browser(self._browser, getattr(self, "_browser_engine", "camoufox"))
        log.info("browser_closed", scraper=self.__class__.__name__)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type(ScraperError),
    )
    async def _navigate_with_retry(self, page: Any, url: str) -> None:
        """Navigate to a URL with retry logic."""
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            raise ScraperError(f"Navigation failed: {url}") from e

    async def _rate_limit(self, rpm: int) -> None:
        """Sleep to respect rate limits with humanized timing."""
        delay = 60.0 / rpm
        await human_pause("navigation", min_override=delay * 0.8, max_override=delay * 1.5)

    async def _humanized_click(self, page: Any, selector: str) -> None:
        """Click an element with human-like mouse movement and timing."""
        element = await page.query_selector(selector)
        if not element:
            return

        box = await element.bounding_box()
        if not box:
            await element.click()
            return

        # Move mouse to element center with Bezier curve
        target_x = box["x"] + box["width"] / 2
        target_y = box["y"] + box["height"] / 2
        await move_mouse_human_like(
            page, target_x, target_y, target_width=box["width"]
        )

        # Pre-click pause
        await quick_pause()

        # Click
        await element.click()

        # Post-click pause
        await human_pause("after_click")

    @abc.abstractmethod
    async def scrape(self) -> list[Lead]:
        """Execute the scraping logic. Must be implemented by subclasses."""
        ...

    async def run(self) -> list[Lead]:
        """Full scrape lifecycle: launch browser, scrape, close."""
        try:
            leads = await self.scrape()
            log.info("scrape_complete", scraper=self.__class__.__name__, count=len(leads))
            return leads
        except Exception:
            log.exception("scrape_failed", scraper=self.__class__.__name__)
            raise
        finally:
            await self._close_browser()
