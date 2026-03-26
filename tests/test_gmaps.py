"""Tests for the Google Maps scraper (unit tests, no browser required)."""

from src.config.loader import load_config
from src.scrapers.gmaps import GoogleMapsScraper


class TestGoogleMapsScraper:
    def test_build_search_url(self):
        scraper = GoogleMapsScraper()
        url = scraper._build_search_url("cocktail bars London")
        assert "google.com/maps/search/" in url
        assert "cocktail+bars+London" in url
        assert "hl=en" in url

    def test_build_search_url_locale(self):
        scraper = GoogleMapsScraper()
        url = scraper._build_search_url("wine bars")
        assert "hl=en" in url

    def test_init_with_config(self):
        config = load_config()
        scraper = GoogleMapsScraper(config=config)
        assert scraper.gmaps_config.target_count == 60
        assert len(scraper.gmaps_config.search_queries) > 0

    def test_collected_leads_starts_empty(self):
        scraper = GoogleMapsScraper()
        assert scraper.collected_leads == []
