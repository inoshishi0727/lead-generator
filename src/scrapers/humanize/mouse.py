"""Human-like mouse movement using Fitts's law and Bezier curves.

Ported from of-automation for async Playwright.
"""

from __future__ import annotations

import math
import random
from typing import Any

import structlog

from src.scrapers.humanize.timing import quick_pause

log = structlog.get_logger()


def fitts_law_duration(
    distance: float,
    target_width: float = 20.0,
    a: float = 0.1,
    b: float = 0.1,
) -> float:
    """Calculate movement time using Fitts's law.

    MT = a + b * log2(2D / W)

    Args:
        distance: Distance to target in pixels
        target_width: Width of target element in pixels
        a: Intercept constant (base reaction time)
        b: Slope constant (motor difficulty)

    Returns:
        Movement time in seconds
    """
    if distance <= 0 or target_width <= 0:
        return a
    index_of_difficulty = math.log2(2 * distance / target_width)
    duration = a + b * max(0, index_of_difficulty)
    # Add natural variance
    duration *= random.uniform(0.8, 1.3)
    return max(0.05, duration)


def _cubic_bezier(
    t: float,
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
) -> tuple[float, float]:
    """Evaluate a cubic Bezier curve at parameter t."""
    u = 1 - t
    x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
    y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
    return (x, y)


def generate_bezier_curve(
    start: tuple[float, float],
    end: tuple[float, float],
    num_points: int = 30,
    jitter: float = 15.0,
    overshoot: float = 0.0,
) -> list[tuple[float, float]]:
    """Generate a Bezier curve path between two points.

    Args:
        start: Starting (x, y) coordinates
        end: Target (x, y) coordinates
        num_points: Number of intermediate points
        jitter: Random deviation for control points
        overshoot: How far past the target to overshoot (pixels)
    """
    dx = end[0] - start[0]
    dy = end[1] - start[1]

    # Control points with random deviation
    cp1 = (
        start[0] + dx * 0.3 + random.gauss(0, jitter),
        start[1] + dy * 0.3 + random.gauss(0, jitter),
    )
    cp2 = (
        start[0] + dx * 0.7 + random.gauss(0, jitter),
        start[1] + dy * 0.7 + random.gauss(0, jitter),
    )

    # Apply overshoot
    actual_end = end
    if overshoot > 0 and (dx != 0 or dy != 0):
        dist = math.hypot(dx, dy)
        actual_end = (
            end[0] + (dx / dist) * overshoot,
            end[1] + (dy / dist) * overshoot,
        )

    points: list[tuple[float, float]] = []
    for i in range(num_points + 1):
        t = i / num_points
        point = _cubic_bezier(t, start, cp1, cp2, actual_end)
        # Add micro-jitter for natural imprecision
        point = (
            point[0] + random.gauss(0, 0.5),
            point[1] + random.gauss(0, 0.5),
        )
        points.append(point)

    # If overshoot, add correction points back to target
    if overshoot > 0:
        correction_points = max(3, int(num_points * 0.15))
        for i in range(1, correction_points + 1):
            t = i / correction_points
            x = actual_end[0] + (end[0] - actual_end[0]) * t
            y = actual_end[1] + (end[1] - actual_end[1]) * t
            points.append((x + random.gauss(0, 0.3), y + random.gauss(0, 0.3)))

    return points


async def move_mouse_human_like(
    page: Any,
    x: float,
    y: float,
    start_x: float | None = None,
    start_y: float | None = None,
    target_width: float = 20.0,
) -> None:
    """Move the mouse to (x, y) with human-like Bezier curve motion.

    Args:
        page: Playwright page object
        x: Target x coordinate
        y: Target y coordinate
        start_x: Starting x (None = random reasonable position)
        start_y: Starting y (None = random reasonable position)
        target_width: Target element width for Fitts's law
    """
    if start_x is None:
        viewport = page.viewport_size or {"width": 1280, "height": 720}
        start_x = random.uniform(100, viewport["width"] - 100)
        start_y = random.uniform(100, viewport["height"] - 100)

    distance = math.hypot(x - start_x, y - start_y)
    duration = fitts_law_duration(distance, target_width)

    # Decide on overshoot (more likely for longer distances)
    overshoot = 0.0
    if distance > 200 and random.random() < 0.3:
        overshoot = random.uniform(5, 15)

    num_points = max(10, int(duration * 60))  # ~60fps
    points = generate_bezier_curve(
        (start_x, start_y), (x, y), num_points=num_points, overshoot=overshoot
    )

    # Move through points with variable timing
    step_delay = duration / len(points)
    for point in points:
        await page.mouse.move(point[0], point[1])
        # Variable inter-step delay
        jittered_delay = step_delay * random.uniform(0.6, 1.4)
        if jittered_delay > 0.001:
            import asyncio
            await asyncio.sleep(jittered_delay)


async def random_mouse_movement(page: Any, num_movements: int = 3) -> None:
    """Perform idle random mouse movements to simulate natural scanning.

    Args:
        page: Playwright page object
        num_movements: Number of random movements to make
    """
    viewport = page.viewport_size or {"width": 1280, "height": 720}
    w, h = viewport["width"], viewport["height"]

    for _ in range(num_movements):
        x = random.uniform(w * 0.1, w * 0.9)
        y = random.uniform(h * 0.1, h * 0.9)
        await move_mouse_human_like(page, x, y)
        await quick_pause()
