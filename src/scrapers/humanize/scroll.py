"""Human-like scrolling behaviors for Playwright.

Ported from of-automation with async adaptation.
"""

from __future__ import annotations

import asyncio
import random
from typing import Any

import structlog

from src.scrapers.humanize.timing import human_pause

log = structlog.get_logger()


async def smooth_scroll(
    page: Any,
    direction: str = "down",
    distance: int | None = None,
) -> None:
    """Scroll smoothly in a direction with Gaussian step sizes.

    Args:
        page: Playwright page object
        direction: "down" or "up"
        distance: Total pixels to scroll (None = random 200-600)
    """
    if distance is None:
        distance = int(random.gauss(400, 100))
        distance = max(150, min(800, distance))

    sign = 1 if direction == "down" else -1
    remaining = distance
    steps = random.randint(3, 8)

    for i in range(steps):
        step = int(random.gauss(remaining / (steps - i), remaining * 0.1))
        step = max(20, min(remaining, step))
        remaining -= step

        await page.mouse.wheel(0, sign * step)
        await asyncio.sleep(random.uniform(0.02, 0.08))

        if remaining <= 0:
            break

    # Occasional brief pause after scrolling
    if random.random() < 0.3:
        await human_pause("reading_short", max_override=1.5)


async def scroll_like_human(
    page: Any,
    total_distance: int = 2000,
    direction: str = "down",
) -> None:
    """Scroll through content like a human — variable speeds, occasional pauses and reverse scrolls.

    Args:
        page: Playwright page object
        total_distance: Total scroll distance in pixels
        direction: Primary direction ("down" or "up")
    """
    scrolled = 0

    while scrolled < total_distance:
        # Main scroll burst
        chunk = int(random.gauss(300, 80))
        chunk = max(100, min(600, chunk))
        chunk = min(chunk, total_distance - scrolled)

        await smooth_scroll(page, direction, chunk)
        scrolled += chunk

        # Reading pause (40% chance)
        if random.random() < 0.4:
            await human_pause("reading_short")

        # Reverse scroll (10% chance) — re-reading behavior
        if random.random() < 0.1 and scrolled > 200:
            reverse_amount = int(random.uniform(50, 150))
            reverse_dir = "up" if direction == "down" else "down"
            await smooth_scroll(page, reverse_dir, reverse_amount)
            # Don't count reverse in progress — scroll it again
            await human_pause("micro")


async def simulate_reading_page(
    page: Any,
    min_seconds: float = 2.0,
    max_seconds: float = 6.0,
) -> None:
    """Simulate reading a page with scroll, pause, and mouse movement.

    Args:
        page: Playwright page object
        min_seconds: Minimum reading time
        max_seconds: Maximum reading time
    """
    reading_time = random.uniform(min_seconds, max_seconds)
    elapsed = 0.0

    while elapsed < reading_time:
        action = random.choices(
            ["scroll", "pause", "nothing"],
            weights=[0.4, 0.4, 0.2],
        )[0]

        if action == "scroll":
            await smooth_scroll(page, "down", int(random.uniform(100, 300)))
            dt = random.uniform(0.3, 0.8)
        elif action == "pause":
            dt = await human_pause("reading_short", max_override=2.0)
        else:
            dt = random.uniform(0.2, 0.5)
            await asyncio.sleep(dt)

        elapsed += dt
