"""Human-like timing with probability distributions and session personality.

Ported from of-automation for async Playwright usage.
"""

from __future__ import annotations

import asyncio
import contextvars
import math
import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import structlog

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# Probability distributions
# ---------------------------------------------------------------------------


def log_normal_sample(mu: float, sigma: float) -> float:
    """Sample from a log-normal distribution (natural human timing)."""
    return random.lognormvariate(math.log(mu), sigma)


def gamma_sample(shape: float, scale: float) -> float:
    """Sample from a gamma distribution."""
    return random.gammavariate(shape, scale)


def weibull_sample(alpha: float, beta: float) -> float:
    """Sample from a Weibull distribution."""
    return random.weibullvariate(alpha, beta)


def mixed_distribution_sample(base: float, variance: float = 0.3) -> float:
    """Sample from a mixture of distributions for natural variance.

    70% log-normal, 20% gamma, 10% uniform noise.
    """
    roll = random.random()
    if roll < 0.7:
        result = log_normal_sample(base, variance)
    elif roll < 0.9:
        result = gamma_sample(2.0, base / 2.0)
    else:
        result = random.uniform(base * 0.5, base * 1.5)

    return max(0.05, result)  # Floor at 50ms


# ---------------------------------------------------------------------------
# Session personality
# ---------------------------------------------------------------------------


@dataclass
class UserPersonality:
    """Simulates a unique user browsing style for the session."""

    speed_multiplier: float = 1.0  # <1 = faster, >1 = slower
    variance: float = 0.3  # Timing variance
    distraction_probability: float = 0.05  # Chance of random long pause
    fatigue_factor: float = 0.0  # Accumulates over time
    actions_performed: int = field(default=0, init=False)

    def apply_fatigue(self, base_delay: float) -> float:
        """Gradually slow down as the session progresses."""
        self.actions_performed += 1
        fatigue_boost = 1.0 + (self.fatigue_factor * (self.actions_performed / 100))
        return base_delay * self.speed_multiplier * fatigue_boost


_personality_var: contextvars.ContextVar[Optional[UserPersonality]] = (
    contextvars.ContextVar("session_personality", default=None)
)


def initialize_session_personality(
    speed: str = "normal",
    focus: str = "normal",
    fatigue: str = "low",
) -> UserPersonality:
    """Create and store a session personality for the current async task.

    Args:
        speed: "fast", "normal", or "slow"
        focus: "high", "normal", or "low" (affects distraction probability)
        fatigue: "none", "low", "medium", or "high"
    """
    speed_map = {
        "fast": random.uniform(0.6, 0.85),
        "normal": random.uniform(0.85, 1.15),
        "slow": random.uniform(1.15, 1.5),
    }
    focus_map = {
        "high": random.uniform(0.01, 0.03),
        "normal": random.uniform(0.03, 0.08),
        "low": random.uniform(0.08, 0.15),
    }
    fatigue_map = {
        "none": 0.0,
        "low": random.uniform(0.01, 0.03),
        "medium": random.uniform(0.03, 0.06),
        "high": random.uniform(0.06, 0.10),
    }

    personality = UserPersonality(
        speed_multiplier=speed_map.get(speed, 1.0),
        variance=random.uniform(0.2, 0.4),
        distraction_probability=focus_map.get(focus, 0.05),
        fatigue_factor=fatigue_map.get(fatigue, 0.02),
    )
    _personality_var.set(personality)
    log.info(
        "session_personality_initialized",
        speed=personality.speed_multiplier,
        distraction=personality.distraction_probability,
        fatigue=personality.fatigue_factor,
    )
    return personality


def get_personality() -> UserPersonality:
    """Get the current session personality, creating one if needed."""
    p = _personality_var.get()
    if p is None:
        p = initialize_session_personality()
    return p


# ---------------------------------------------------------------------------
# Timing contexts
# ---------------------------------------------------------------------------


class TimingContext(Enum):
    """Named timing contexts with base durations in seconds."""

    MICRO = 0.05
    MOUSE_PREP = 0.15
    AFTER_CLICK = 0.4
    READING_SHORT = 0.8
    READING_MEDIUM = 2.0
    READING_LONG = 4.0
    BETWEEN_FIELDS = 0.6
    DECISION = 1.5
    PAGE_LOAD = 2.5
    AFTER_SUBMIT = 1.0
    DISTRACTION = 5.0
    NAVIGATION = 3.0
    BETWEEN_LISTINGS = 1.2


async def human_pause(
    context: str | TimingContext,
    min_override: float | None = None,
    max_override: float | None = None,
) -> float:
    """Pause for a human-like duration based on context.

    Args:
        context: Timing context name or TimingContext enum
        min_override: Minimum delay override
        max_override: Maximum delay override

    Returns:
        Actual delay in seconds
    """
    if isinstance(context, str):
        try:
            ctx = TimingContext[context.upper()]
        except KeyError:
            ctx = TimingContext.READING_SHORT
    else:
        ctx = context

    personality = get_personality()
    base = ctx.value

    # Apply personality and distribution
    delay = mixed_distribution_sample(base, personality.variance)
    delay = personality.apply_fatigue(delay)

    # Random distraction
    if random.random() < personality.distraction_probability:
        distraction = mixed_distribution_sample(
            TimingContext.DISTRACTION.value, 0.5
        )
        delay += distraction
        log.debug("distraction_pause", extra_seconds=distraction)

    # Apply overrides
    if min_override is not None:
        delay = max(delay, min_override)
    if max_override is not None:
        delay = min(delay, max_override)

    await asyncio.sleep(delay)
    return delay


# ---------------------------------------------------------------------------
# Convenience functions
# ---------------------------------------------------------------------------


async def quick_pause() -> float:
    """Quick micro-pause (50-200ms)."""
    return await human_pause(TimingContext.MICRO, max_override=0.2)


async def reading_pause() -> float:
    """Pause as if reading short content."""
    return await human_pause(TimingContext.READING_SHORT)


async def thinking_pause() -> float:
    """Pause as if making a decision."""
    return await human_pause(TimingContext.DECISION)
