"""Unified dedup interface — Firestore + local JSON fallback.

Dedup is SOURCE-AGNOSTIC: a lead found on Google Maps will block the same
lead from being added via Bing, Yell, or any other scraper. The universal
dedup key is `name_normalized|domain_or_address`.

Includes SharedDedupSet for parallel scraping with asyncio.Lock protection.
"""

from __future__ import annotations

import asyncio
from urllib.parse import urlparse

import structlog

from src.db.local_dedup import add_local_dedup_key, load_local_dedup_keys

log = structlog.get_logger()


def _normalize_name(name: str | None) -> str:
    """Normalize a business name for dedup comparison.

    Reuses the richer exclusion-list normalizer: lowercases, strips company
    suffixes (Ltd/Limited/Group/...), and collapses whitespace, so cosmetic
    variance in a Google Maps name doesn't fork the dedup key.
    """
    from src.db.exclusions import _normalize_name as _strict_name
    return _strict_name(name or "")


def _extract_domain(url_or_address: str | None) -> str:
    """Extract a normalized domain from a URL, else a normalized address string."""
    if not url_or_address:
        return ""
    from src.db.exclusions import _extract_domain as _strict_domain, _normalize_address

    s = url_or_address.strip()
    first_segment = s.split("/")[0]
    # Looks like a URL/domain (has a scheme, or a dot with no spaces before the path)?
    if "://" in s or ("." in first_segment and " " not in first_segment):
        dom = _strict_domain(s)
        if dom:
            return dom
    # Otherwise treat it as a street address.
    return _normalize_address(s) or s.strip().lower()


def build_dedup_key(
    source: str, name: str, address: str | None, place_id: str | None = None
) -> str:
    """Build a composite dedup key.

    When a stable Google Maps ``place_id`` is available it anchors the key so
    the same venue always produces the same key regardless of name/address/
    website drift. Otherwise we fall back to name|domain. Source is kept as a
    prefix for attribution; matching strips it (see ``build_universal_key``).
    """
    if place_id:
        return f"{source}|gmaps:{place_id.strip()}"
    return "|".join([source, _normalize_name(name), _extract_domain(address)])


def build_universal_key(
    name: str, domain_or_address: str | None, place_id: str | None = None
) -> str:
    """Build a source-agnostic key for cross-source dedup.

    Prefers the stable ``place_id`` (``gmaps:<id>``); falls back to name|domain.
    """
    if place_id:
        return f"gmaps:{place_id.strip()}"
    return f"{_normalize_name(name)}|{_extract_domain(domain_or_address)}"


def get_all_dedup_keys_universal() -> set[str]:
    """Load ALL dedup keys from Firestore (all sources) + local JSON.

    Returns universal keys (name|domain) stripped of source prefix.
    """
    from src.db.client import get_firestore_client
    from google.cloud.firestore_v1.base_query import FieldFilter

    universal_keys: set[str] = set()

    # Firestore: load ALL leads, not filtered by source
    db = get_firestore_client()
    if db is not None:
        try:
            for doc in db.collection("leads").stream():
                data = doc.to_dict()
                name = data.get("business_name", "")
                website = data.get("website") or data.get("address") or ""
                place_id = data.get("google_maps_place_id")
                if name or place_id:
                    universal_keys.add(build_universal_key(name, website, place_id))
        except Exception as exc:
            log.warning("firestore_dedup_load_failed", error=str(exc))

    # Local JSON: parse existing keys (format: source|name|domain)
    local_keys = load_local_dedup_keys()
    for key in local_keys:
        parts = key.split("|", 1)
        if len(parts) >= 2:
            # Strip source prefix -> name|domain
            universal_keys.add(parts[1])

    log.debug("universal_dedup_loaded", total=len(universal_keys))
    return universal_keys


def get_all_dedup_keys(source: str = "google_maps") -> set[str]:
    """Legacy: returns source-specific keys. Use get_all_dedup_keys_universal instead."""
    from src.db.firestore import get_known_dedup_keys

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

    Pre-loads ALL existing leads from Firestore + local JSON for cross-source
    dedup. A lead found on Google Maps will be blocked if Bing tries to add it.
    """

    def __init__(self) -> None:
        self._keys: set[str] = set()          # universal keys (name|domain)
        self._source_keys: set[str] = set()   # full keys (source|name|domain)
        self._lock = asyncio.Lock()

    async def load_from_db(self, source: str) -> None:
        """Pre-load universal dedup keys from ALL sources."""
        universal = get_all_dedup_keys_universal()
        async with self._lock:
            self._keys.update(universal)
        log.info("shared_dedup_loaded", source=source, universal_keys=len(self._keys))

    async def check_and_add(self, key: str) -> bool:
        """Returns True if key was new (added), False if already existed.

        Checks against universal keys (source-agnostic).
        """
        # Extract universal portion: strip source prefix
        parts = key.split("|", 1)
        universal = parts[1] if len(parts) >= 2 else key

        async with self._lock:
            if universal in self._keys:
                return False
            self._keys.add(universal)
            self._source_keys.add(key)
            return True

    async def contains_prefix(self, prefix: str) -> bool:
        """Check if any key matches by name prefix (source-agnostic).

        Accepts format 'source|name|' — strips source for universal check.
        """
        parts = prefix.split("|", 1)
        name_prefix = parts[1] if len(parts) >= 2 else prefix

        async with self._lock:
            return any(k.startswith(name_prefix) for k in self._keys)

    @property
    def size(self) -> int:
        return len(self._keys)
