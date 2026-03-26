"""Database layer — Firebase Firestore."""

from src.db.client import get_firestore_client
from src.db.firestore import (
    get_known_dedup_keys,
    get_leads,
    log_activity,
    save_leads,
    save_scrape_run,
    update_scrape_run,
)

__all__ = [
    "get_firestore_client",
    "get_known_dedup_keys",
    "get_leads",
    "log_activity",
    "save_leads",
    "save_scrape_run",
    "update_scrape_run",
]
