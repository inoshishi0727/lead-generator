"""Human-like keyboard typing simulation for Playwright.

Ported from of-automation with async adaptation.
Simulates realistic typing rhythm, occasional typos, and fatigue.
"""

from __future__ import annotations

import asyncio
import random
from typing import Any

import structlog

log = structlog.get_logger()

# Adjacent keys for simulating typos (QWERTY layout)
ADJACENT_KEYS: dict[str, str] = {
    "a": "sqwz",
    "b": "vghn",
    "c": "xdfv",
    "d": "sfec",
    "e": "wrd",
    "f": "dgrc",
    "g": "fhtv",
    "h": "gjyn",
    "i": "ujko",
    "j": "hkun",
    "k": "jlio",
    "l": "kop",
    "m": "njk",
    "n": "bhjm",
    "o": "iklp",
    "p": "ol",
    "q": "wa",
    "r": "eft",
    "s": "adwx",
    "t": "rgy",
    "u": "yhji",
    "v": "cfgb",
    "w": "qase",
    "x": "zsdc",
    "y": "thu",
    "z": "asx",
}

# Common words get typed faster
COMMON_WORDS = {
    "the",
    "and",
    "for",
    "that",
    "with",
    "this",
    "from",
    "your",
    "have",
    "are",
    "was",
    "will",
    "can",
    "not",
    "but",
    "all",
    "been",
    "one",
    "our",
    "out",
}


def _base_delay(skill_level: str) -> tuple[float, float]:
    """Get base keystroke delay range by skill level."""
    levels = {
        "hunt_peck": (0.15, 0.35),
        "casual": (0.06, 0.15),
        "proficient": (0.03, 0.10),
        "expert": (0.02, 0.06),
    }
    return levels.get(skill_level, levels["casual"])


async def human_type(
    page: Any,
    selector: str,
    text: str,
    skill_level: str = "casual",
    typo_probability: float = 0.02,
) -> None:
    """Type text into an element with human-like rhythm.

    Args:
        page: Playwright page object
        selector: CSS or XPath selector for the input element
        text: Text to type
        skill_level: "hunt_peck", "casual", "proficient", or "expert"
        typo_probability: Probability of making a typo per character
    """
    element = await page.query_selector(selector)
    if not element:
        log.warning("type_target_not_found", selector=selector)
        return

    await element.click()
    await asyncio.sleep(random.uniform(0.1, 0.3))

    min_delay, max_delay = _base_delay(skill_level)
    chars_typed = 0
    words = text.split()
    current_word = ""

    for char in text:
        # Track current word for speed-up
        if char == " ":
            current_word = ""
        else:
            current_word += char

        # Calculate delay
        delay = random.uniform(min_delay, max_delay)

        # Speed up for common words
        if current_word.lower() in COMMON_WORDS:
            delay *= 0.7

        # Slow down after many characters (fatigue)
        chars_typed += 1
        if chars_typed > 50:
            delay *= 1.0 + (chars_typed - 50) * 0.002

        # Slight pause at word boundaries
        if char == " ":
            delay += random.uniform(0.02, 0.08)

        # Simulate typo
        if (
            random.random() < typo_probability
            and char.lower() in ADJACENT_KEYS
            and len(text) > 3
        ):
            wrong_char = random.choice(ADJACENT_KEYS[char.lower()])
            await page.keyboard.type(wrong_char)
            await asyncio.sleep(random.uniform(0.1, 0.3))
            await page.keyboard.press("Backspace")
            await asyncio.sleep(random.uniform(0.05, 0.15))

        await page.keyboard.type(char)
        await asyncio.sleep(delay)

    # Brief pause after finishing typing
    await asyncio.sleep(random.uniform(0.1, 0.4))
