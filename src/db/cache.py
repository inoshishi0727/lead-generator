"""Simple in-memory TTL cache for Firestore queries.

Avoids hitting Firestore on every API request. Cache is invalidated
when leads are saved/updated, or expires after TTL.
"""

from __future__ import annotations

import time
from typing import Any

import structlog

log = structlog.get_logger()

_cache: dict[str, tuple[float, Any]] = {}
_DEFAULT_TTL = 60  # seconds


def get(key: str) -> Any | None:
    """Get a value from cache if it exists and hasn't expired."""
    if key in _cache:
        expires_at, value = _cache[key]
        if time.monotonic() < expires_at:
            return value
        del _cache[key]
    return None


def set(key: str, value: Any, ttl: int = _DEFAULT_TTL) -> None:
    """Set a value in cache with TTL."""
    _cache[key] = (time.monotonic() + ttl, value)


def invalidate(prefix: str = "") -> None:
    """Invalidate all cache entries matching prefix. Empty prefix clears all."""
    if not prefix:
        _cache.clear()
        log.debug("cache_cleared")
        return
    keys_to_delete = [k for k in _cache if k.startswith(prefix)]
    for k in keys_to_delete:
        del _cache[k]
    if keys_to_delete:
        log.debug("cache_invalidated", prefix=prefix, count=len(keys_to_delete))
