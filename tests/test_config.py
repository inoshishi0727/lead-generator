"""Tests for config loader."""

from src.config.loader import AppConfig, load_config


class TestConfigLoader:
    def test_loads_config(self):
        config = load_config()
        assert isinstance(config, AppConfig)
        assert config.project.name == "Asterley Bros Lead Generation"

    def test_scoring_weights(self):
        config = load_config()
        assert config.scoring.weights.serves_cocktails == 15
        assert config.scoring.weights.menu_fit_score == 15
        assert config.scoring.weights.venue_category_match == 12
        assert config.scoring.min_score_threshold == 40

    def test_scraping_config(self):
        config = load_config()
        assert config.scraping.google_maps.target_count == 60
        assert config.scraping.instagram.target_count == 40

    def test_rate_limits(self):
        config = load_config()
        assert config.rate_limits.google_maps_rpm == 10

    def test_pipeline_stages(self):
        config = load_config()
        assert "scraped" in config.pipeline.stages
        assert "converted" in config.pipeline.stages
