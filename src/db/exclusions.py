"""Exclusion list management for existing stockists and dealers."""

from __future__ import annotations

import csv
import re
from pathlib import Path
from urllib.parse import urlparse

import structlog

log = structlog.get_logger()

# Common suffixes to strip when normalizing business names
_SUFFIXES = re.compile(
    r"\s+(ltd|limited|plc|inc|llc|co|company|group|holdings)\s*\.?\s*$",
    re.IGNORECASE,
)


def _normalize_name(name: str) -> str:
    """Normalize a business name for comparison."""
    n = name.strip().lower()
    n = _SUFFIXES.sub("", n)
    # Remove extra whitespace
    n = re.sub(r"\s+", " ", n).strip()
    return n


def _extract_domain(url: str | None) -> str | None:
    """Extract the domain from a URL for comparison."""
    if not url:
        return None
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        # Strip www. prefix
        if domain.startswith("www."):
            domain = domain[4:]
        return domain if domain else None
    except Exception:
        return None


def _normalize_address(address: str | None) -> str | None:
    """Normalize an address for comparison."""
    if not address:
        return None
    a = address.strip().lower()
    a = re.sub(r"\s+", " ", a).strip()
    return a if a else None


class ExclusionSet:
    """Set of existing stockists to exclude from scraping."""

    def __init__(self) -> None:
        self.names: set[str] = set()
        self.domains: set[str] = set()
        self.addresses: set[str] = set()

    def is_excluded(self, name: str, website: str | None = None, address: str | None = None) -> bool:
        """Check if a lead matches any exclusion criteria."""
        norm_name = _normalize_name(name)
        if norm_name in self.names:
            return True

        domain = _extract_domain(website)
        if domain and domain in self.domains:
            return True

        norm_addr = _normalize_address(address)
        if norm_addr and norm_addr in self.addresses:
            return True

        return False


def load_exclusion_set(csv_path: str | Path) -> ExclusionSet:
    """Load exclusion set from a CSV file.

    Expected columns: Name, Full Address, Phone, Website, Email, Category
    """
    path = Path(csv_path)
    exclusion = ExclusionSet()

    if not path.exists():
        log.warning("exclusion_csv_not_found", path=str(path))
        return exclusion

    try:
        with open(path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("Name", "").strip()
                if name:
                    exclusion.names.add(_normalize_name(name))

                website = row.get("Website", "").strip()
                domain = _extract_domain(website)
                if domain:
                    exclusion.domains.add(domain)

                address = row.get("Full Address", "").strip()
                norm_addr = _normalize_address(address)
                if norm_addr:
                    exclusion.addresses.add(norm_addr)

        log.info(
            "exclusion_set_loaded",
            names=len(exclusion.names),
            domains=len(exclusion.domains),
            addresses=len(exclusion.addresses),
        )
    except Exception as exc:
        log.warning("exclusion_csv_load_failed", path=str(path), error=str(exc))

    return exclusion
