"""Tests for Instagram scraper (unit tests, no browser required)."""

from src.scrapers.instagram import InstagramScraper


class TestInstagramScraper:
    def test_parse_count_plain(self):
        assert InstagramScraper._parse_count("500") == 500

    def test_parse_count_thousands(self):
        assert InstagramScraper._parse_count("1.2K") == 1200

    def test_parse_count_millions(self):
        assert InstagramScraper._parse_count("3.4M") == 3400000

    def test_parse_count_comma(self):
        assert InstagramScraper._parse_count("1,234") == 1234

    def test_init(self):
        scraper = InstagramScraper()
        assert scraper.ig_config.target_count == 40
        assert scraper.collected_leads == []
