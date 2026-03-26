"""Local JSON file dedup — fallback when Firestore is unavailable."""

from __future__ import annotations

import json
import os
from pathlib import Path

import structlog

log = structlog.get_logger()

_DEDUP_PATH = Path(__file__).parent.parent.parent / "data" / "seen_leads.json"


def load_local_dedup_keys() -> set[str]:
    """Load dedup keys from local JSON file. Returns empty set if missing.

    Validates that keys have the expected format (at least 2 pipe separators).
    Malformed entries are filtered out and logged.
    """
    try:
        if _DEDUP_PATH.exists():
            with open(_DEDUP_PATH) as f:
                raw_keys = set(json.load(f))
            # Validate: keys should have at least 2 pipe separators (source|name|address)
            valid = {k for k in raw_keys if isinstance(k, str) and k.count("|") >= 2}
            if len(valid) < len(raw_keys):
                log.warning(
                    "invalid_dedup_keys_filtered",
                    total=len(raw_keys),
                    valid=len(valid),
                    dropped=len(raw_keys) - len(valid),
                )
            return valid
    except Exception as exc:
        log.warning("local_dedup_load_failed", error=str(exc))
    return set()


def save_local_dedup_keys(keys: set[str]) -> None:
    """Atomic write of dedup keys to local JSON file."""
    try:
        _DEDUP_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = _DEDUP_PATH.with_suffix(".tmp")
        with open(tmp, "w") as f:
            json.dump(sorted(keys), f)
        os.replace(tmp, _DEDUP_PATH)
    except Exception as exc:
        log.warning("local_dedup_save_failed", error=str(exc))


def add_local_dedup_key(key: str) -> None:
    """Load, add one key, and save back."""
    keys = load_local_dedup_keys()
    keys.add(key)
    save_local_dedup_keys(keys)
