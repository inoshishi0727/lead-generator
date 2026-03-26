"""Instagram scraper using Claude computer-use agent + Camoufox.

Discovers venue profiles through hashtag exploration and extracts
profile data (followers, bio, contact info).
"""

from __future__ import annotations

import asyncio
import re

import structlog

from src.config.loader import AppConfig
from src.db.dedup import SharedDedupSet, build_dedup_key, record_dedup_key
from src.db.firestore import save_lead_immediate
from src.db.models import Lead, LeadSource
from src.scrapers.base import BaseScraper

log = structlog.get_logger()


class InstagramScraper(BaseScraper):
    """Scrapes venue leads from Instagram hashtag pages."""

    def __init__(
        self,
        config: AppConfig | None = None,
        shared_dedup: SharedDedupSet | None = None,
    ) -> None:
        super().__init__(config)
        self.ig_config = self.config.scraping.instagram
        self.collected_leads: list[Lead] = []
        self._shared_dedup = shared_dedup

    async def _login(self, page) -> None:
        """Log in to Instagram using stored credentials."""
        import os

        username = os.environ.get("INSTAGRAM_USERNAME", "")
        password = os.environ.get("INSTAGRAM_PASSWORD", "")

        await self._navigate_with_retry(page, "https://www.instagram.com/accounts/login/")
        await page.wait_for_selector('input[name="username"]', timeout=15000)

        await page.fill('input[name="username"]', username)
        await page.fill('input[name="password"]', password)
        await page.click('button[type="submit"]')

        # Wait for navigation to complete
        await page.wait_for_url("**/instagram.com/**", timeout=30000)
        log.info("instagram_login_complete")

    async def _scrape_hashtag(self, page, hashtag: str) -> list[dict]:
        """Scrape profiles from a hashtag page."""
        url = f"https://www.instagram.com/explore/tags/{hashtag}/"
        await self._navigate_with_retry(page, url)

        await asyncio.sleep(3)

        # Collect post links
        post_links = await page.query_selector_all('a[href*="/p/"]')
        profiles = []
        seen_usernames = set()

        for link in post_links[: self.ig_config.max_profiles_per_hashtag]:
            try:
                href = await link.get_attribute("href")
                if not href:
                    continue

                await link.click()
                await asyncio.sleep(2)

                # Extract username from the post modal/page
                username_el = await page.query_selector(
                    'a[href^="/"][role="link"] span'
                )
                if username_el:
                    username = (await username_el.inner_text()).strip()
                    if username and username not in seen_usernames:
                        seen_usernames.add(username)
                        profiles.append({"username": username, "hashtag": hashtag})

                # Close modal or go back
                close_btn = await page.query_selector('svg[aria-label="Close"]')
                if close_btn:
                    await close_btn.click()
                else:
                    await page.go_back()

                await asyncio.sleep(1)

            except Exception:
                log.debug("post_scrape_failed", hashtag=hashtag)
                try:
                    await page.go_back()
                except Exception:
                    pass

            await self._rate_limit(self.config.rate_limits.instagram_rpm)

        return profiles

    async def _scrape_profile(self, page, username: str) -> dict | None:
        """Extract profile data from a username's profile page."""
        url = f"https://www.instagram.com/{username}/"
        try:
            await self._navigate_with_retry(page, url)
            await asyncio.sleep(2)

            data = {"username": username}

            # Extract follower count from meta or page content
            meta = await page.query_selector('meta[name="description"]')
            if meta:
                content = await meta.get_attribute("content") or ""
                followers_match = re.search(r"([\d,.]+[KMkm]?)\s*Followers", content)
                if followers_match:
                    data["followers"] = self._parse_count(followers_match.group(1))

                # Extract bio snippet
                data["bio"] = content

            # Check for business contact info
            email_btn = await page.query_selector('a[href^="mailto:"]')
            if email_btn:
                data["email"] = (await email_btn.get_attribute("href")).replace(
                    "mailto:", ""
                )

            return data

        except Exception:
            log.debug("profile_scrape_failed", username=username)
            return None

    @staticmethod
    def _parse_count(text: str) -> int:
        """Parse follower counts like '1.2K', '500', '3.4M'."""
        text = text.strip().replace(",", "")
        multiplier = 1
        if text.upper().endswith("K"):
            multiplier = 1_000
            text = text[:-1]
        elif text.upper().endswith("M"):
            multiplier = 1_000_000
            text = text[:-1]
        try:
            return int(float(text) * multiplier)
        except ValueError:
            return 0

    async def scrape(self) -> list[Lead]:
        """Execute full Instagram scraping across all hashtags."""
        headless = self.ig_config.headless
        ctx = await self._launch_browser(headless=headless)
        page = await ctx.new_page()

        await self._login(page)

        all_profiles: list[dict] = []
        for hashtag in self.ig_config.hashtags:
            if len(all_profiles) >= self.ig_config.target_count:
                break

            log.info("scraping_hashtag", hashtag=hashtag)
            profiles = await self._scrape_hashtag(page, hashtag)
            all_profiles.extend(profiles)

        # Deduplicate and scrape individual profiles
        seen: set[str] = set()
        for profile_data in all_profiles:
            username = profile_data["username"]
            if username in seen:
                continue
            seen.add(username)

            if len(self.collected_leads) >= self.ig_config.target_count:
                break

            # Check shared dedup set if in parallel mode
            dedup_key = build_dedup_key("instagram", username, None)
            if self._shared_dedup:
                is_new = await self._shared_dedup.check_and_add(dedup_key)
                if not is_new:
                    log.debug("ig_lead_already_known", username=username)
                    continue

            detail = await self._scrape_profile(page, username)
            if detail:
                lead = Lead(
                    source=LeadSource.INSTAGRAM,
                    business_name=username,
                    instagram_handle=username,
                    instagram_followers=detail.get("followers"),
                    email=detail.get("email"),
                )

                # Save immediately to Firestore in parallel mode
                if self._shared_dedup:
                    save_lead_immediate(lead)

                record_dedup_key(dedup_key)
                self.collected_leads.append(lead)

        await page.close()
        return self.collected_leads
