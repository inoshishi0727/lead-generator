"""Humanization system for browser automation.

Provides realistic timing, mouse movement, scrolling, and keyboard behavior
to make automated browsing appear natural.
"""

from src.scrapers.humanize.keyboard import human_type
from src.scrapers.humanize.mouse import (
    move_mouse_human_like,
    random_mouse_movement,
)
from src.scrapers.humanize.scroll import (
    scroll_like_human,
    simulate_reading_page,
    smooth_scroll,
)
from src.scrapers.humanize.timing import (
    UserPersonality,
    human_pause,
    initialize_session_personality,
    quick_pause,
    reading_pause,
    thinking_pause,
)
from src.scrapers.humanize.warmup import warmup_browsing

__all__ = [
    "UserPersonality",
    "human_pause",
    "human_type",
    "initialize_session_personality",
    "move_mouse_human_like",
    "quick_pause",
    "random_mouse_movement",
    "reading_pause",
    "scroll_like_human",
    "simulate_reading_page",
    "smooth_scroll",
    "thinking_pause",
    "warmup_browsing",
]
