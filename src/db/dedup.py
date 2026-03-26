"""Unified dedup interface — Firestore + local JSON fallback.

Includes SharedDedupSet for parallel scraping with asyncio.Lock protection.
"""

from __future__ import annotations

import asyncio

import structlog

from src.db.firestore import get_known_dedup_keys
from src.db.local_dedup import add_local_dedup_key, load_local_dedup_keys

log = structlog.get_logger()


def build_dedup_key(source: str, name: str, address: str | None) -> str:
    """Build a composite dedup key matching the Firestore format."""
    parts = [
        source,
        name.strip().lower(),
        (address or "").strip().lower(),
    ]
    return "|".join(parts)


def get_all_dedup_keys(source: str = "google_maps") -> set[str]:
    """Union of Firestore and local JSON dedup keys."""
    firestore_keys = get_known_dedup_keys(source)
    local_keys = load_local_dedup_keys()
    combined = firestore_keys | local_keys
    log.debug(
        "dedup_keys_combined",
        firestore=len(firestore_keys),
        local=len(local_keys),
        total=len(combined),
    )
    return combined


def record_dedup_key(key: str) -> None:
    """Save a dedup key to local JSON immediately."""
    add_local_dedup_key(key)


class SharedDedupSet:
    """Async-safe dedup set for parallel scraping within a single process.

    Pre-loads existing keys from Firestore + local JSON, then provides
    lock-protected check-and-add for concurrent workers.
    """

    def __init__(self) -> None:
        self._keys: set[str] = set()
        self._lock = asyncio.Lock()

    async def load_from_db(self, source: str) -> None:
        """Pre-load existing keys from Firestore + local JSON."""
        keys = get_all_dedup_keys(source)
        async with self._lock:
            self._keys = keys
        log.info("shared_dedup_loaded", source=source, count=len(keys))

    async def check_and_add(self, key: str) -> bool:
        """Returns True if key was new (added), False if already existed."""
        async with self._lock:
            if key in self._keys:
                return False
            self._keys.add(key)
            return True

    async def contains_prefix(self, prefix: str) -> bool:
        """Check if any key starts with the given prefix."""
        async with self._lock:
            return any(k.startswith(prefix) for k in self._keys)

    @property
    def size(self) -> int:
        return len(self._keys)
