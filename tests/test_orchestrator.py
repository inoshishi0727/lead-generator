"""Tests for parallel scraping: SharedDedupSet, save_lead_immediate, orchestrator."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest

from src.db.dedup import SharedDedupSet, build_dedup_key
from src.db.models import Lead, LeadSource


def _make_lead(**kwargs) -> Lead:
    defaults = {
        "source": LeadSource.GOOGLE_MAPS,
        "business_name": "Test Bar",
    }
    defaults.update(kwargs)
    return Lead(**defaults)


# --- SharedDedupSet Tests ---


class TestSharedDedupSet:
    @pytest.mark.asyncio
    async def test_check_and_add_new_key(self):
        dedup = SharedDedupSet()
        result = await dedup.check_and_add("google_maps|bar a|123 street")
        assert result is True
        assert dedup.size == 1

    @pytest.mark.asyncio
    async def test_check_and_add_duplicate(self):
        dedup = SharedDedupSet()
        await dedup.check_and_add("google_maps|bar a|123 street")
        result = await dedup.check_and_add("google_maps|bar a|123 street")
        assert result is False
        assert dedup.size == 1

    @pytest.mark.asyncio
    async def test_contains_prefix(self):
        dedup = SharedDedupSet()
        await dedup.check_and_add("google_maps|bar a|123 street")
        assert await dedup.contains_prefix("google_maps|bar a|") is True
        assert await dedup.contains_prefix("google_maps|bar b|") is False

    @pytest.mark.asyncio
    async def test_load_from_db(self):
        with patch("src.db.dedup.get_all_dedup_keys") as mock:
            mock.return_value = {"key1", "key2", "key3"}
            dedup = SharedDedupSet()
            await dedup.load_from_db("google_maps")
            assert dedup.size == 3
            assert await dedup.check_and_add("key1") is False  # already loaded
            assert await dedup.check_and_add("key4") is True   # new

    @pytest.mark.asyncio
    async def test_concurrent_access(self):
        """Verify no duplicates under concurrent check_and_add."""
        dedup = SharedDedupSet()
        results = []

        async def worker(key: str):
            result = await dedup.check_and_add(key)
            results.append(result)

        # 10 tasks all trying to add the same key
        tasks = [worker("same_key") for _ in range(10)]
        await asyncio.gather(*tasks)

        # Exactly one should succeed
        assert sum(results) == 1
        assert dedup.size == 1

    @pytest.mark.asyncio
    async def test_concurrent_different_keys(self):
        """Verify all different keys are added under concurrent access."""
        dedup = SharedDedupSet()
        results = []

        async def worker(i: int):
            result = await dedup.check_and_add(f"key_{i}")
            results.append(result)

        tasks = [worker(i) for i in range(20)]
        await asyncio.gather(*tasks)

        assert all(results)
        assert dedup.size == 20


# --- build_dedup_key Tests ---


class TestBuildDedupKey:
    def test_basic_key(self):
        key = build_dedup_key("google_maps", "The Bar", "123 High St")
        assert key == "google_maps|the bar|123 high st"

    def test_no_address(self):
        key = build_dedup_key("instagram", "CoolBar", None)
        assert key == "instagram|coolbar|"

    def test_whitespace_handling(self):
        key = build_dedup_key("google_maps", "  Bar A  ", "  Street  ")
        assert key == "google_maps|bar a|street"


# --- save_lead_immediate Tests ---


class TestSaveLeadImmediate:
    def test_no_firestore(self):
        with patch("src.db.firestore.get_firestore_client", return_value=None):
            from src.db.firestore import save_lead_immediate
            lead = _make_lead()
            result = save_lead_immediate(lead)
            assert result is False

    def test_duplicate_lead(self):
        mock_doc = MagicMock()
        mock_collection = MagicMock()
        mock_collection.where.return_value.limit.return_value.get.return_value = [mock_doc]

        mock_db = MagicMock()
        mock_db.collection.return_value = mock_collection

        with patch("src.db.firestore.get_firestore_client", return_value=mock_db):
            from src.db.firestore import save_lead_immediate
            lead = _make_lead()
            result = save_lead_immediate(lead)
            assert result is False

    def test_new_lead(self):
        mock_collection = MagicMock()
        mock_collection.where.return_value.limit.return_value.get.return_value = []

        mock_db = MagicMock()
        mock_db.collection.return_value = mock_collection

        with patch("src.db.firestore.get_firestore_client", return_value=mock_db):
            from src.db.firestore import save_lead_immediate
            lead = _make_lead(business_name="New Bar", address="1 New St")
            result = save_lead_immediate(lead)
            assert result is True
            mock_collection.document.return_value.set.assert_called_once()


# --- GoogleMapsScraper parallel mode Tests ---


class TestGmapsParallelMode:
    def test_scraper_accepts_shared_dedup(self):
        from src.scrapers.gmaps import GoogleMapsScraper
        dedup = SharedDedupSet()
        scraper = GoogleMapsScraper(shared_dedup=dedup)
        assert scraper._shared_dedup is dedup

    def test_scraper_works_without_shared_dedup(self):
        from src.scrapers.gmaps import GoogleMapsScraper
        scraper = GoogleMapsScraper()
        assert scraper._shared_dedup is None


# --- InstagramScraper parallel mode Tests ---


class TestInstagramParallelMode:
    def test_scraper_accepts_shared_dedup(self):
        from src.scrapers.instagram import InstagramScraper
        dedup = SharedDedupSet()
        scraper = InstagramScraper(shared_dedup=dedup)
        assert scraper._shared_dedup is dedup

    def test_scraper_works_without_shared_dedup(self):
        from src.scrapers.instagram import InstagramScraper
        scraper = InstagramScraper()
        assert scraper._shared_dedup is None


# --- Config Tests ---


class TestParallelConfig:
    def test_gmaps_parallel_config(self):
        from src.config.loader import load_config
        config = load_config()
        assert config.scraping.google_maps.max_parallel_browsers == 3

    def test_instagram_parallel_config(self):
        from src.config.loader import load_config
        config = load_config()
        assert config.scraping.instagram.max_parallel_browsers == 2
