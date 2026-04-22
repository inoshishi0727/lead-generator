"""LinkedIn employee + company-page scraper (All-tab search + agentic company page).

Given an existing lead, navigates to LinkedIn's All-tab search for the
business name, collects every profile card on the results page, and asks
Gemini to identify which profiles are actually current or past employees.

If scrape_company_page is enabled (default), also searches for the company's
LinkedIn page, navigates to the About tab, and uses a Gemini agentic browser
loop to extract: social media URLs (Instagram, Twitter/X, Facebook, TikTok,
YouTube), phone numbers, email addresses, website, company size, and industry.
Employees from the People tab are also collected when available.

Auth uses a persistent browser profile at data/linkedin_browser_profile/
(cloakbrowser `launch_persistent_context_async`). The first save-session
logs in; every subsequent run reopens the same profile and stays logged in.
The profile stores cookies + localStorage + fingerprint data, so LinkedIn
sees the same "device" across runs and doesn't revoke the session.

CLI:
    python -m src.scrapers.linkedin --save-session
    python -m src.scrapers.linkedin --lead-ids UUID[,UUID,...]
    python -m src.scrapers.linkedin --auto-select-count 10
    python -m src.scrapers.linkedin --all --daily-cap 20
    python -m src.scrapers.linkedin --lead-ids UUID --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import secrets
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus
from uuid import UUID

import structlog

from src.config.loader import AppConfig, load_config
from src.db.firestore import (
    count_linkedin_scrapes_today,
    get_all_leads_needing_linkedin_scrape,
    get_lead_by_id,
    get_leads_needing_linkedin_scrape,
    log_activity,
    save_linkedin_employee,
    update_lead,
    update_lead_linkedin_status,
)
from src.db.models import Lead, LinkedInCompanyData, LinkedInConfidence, LinkedInEmployee
from src.scrapers.base import BaseScraper, ScraperError
from src.scrapers.humanize.scroll import smooth_scroll
from src.scrapers.humanize.timing import human_pause
from src.scrapers.selectors import linkedin_selectors as sel

log = structlog.get_logger()


SESSION_CHECK_URL = "https://www.linkedin.com/feed/"
ALL_TAB_SEARCH_URL_TEMPLATE = (
    "https://www.linkedin.com/search/results/all/?keywords={keywords}&origin=SWITCH_SEARCH_VERTICAL"
)
COMPANY_SEARCH_URL_TEMPLATE = (
    "https://www.linkedin.com/search/results/companies/?keywords={keywords}&origin=SWITCH_SEARCH_VERTICAL"
)

# Gemini filter — small task, small budget. Not config knobs.
# Budget sized to comfortably fit a structured JSON response for ~25 candidates
# even if the 2.5 thinking-models eat some headroom before answering.
FILTER_MAX_TOKENS = 4000
FILTER_TEMPERATURE = 0.1
_CONFIDENCE_RANK = {"none": 0, "low": 1, "medium": 2, "high": 3}

# Fallback chain. If the configured `gemini_model` returns 5xx after the
# in-built retry loop, we cycle through these. Different models run on
# different infrastructure so one being overloaded doesn't necessarily
# mean the next is too. `gemini-flash-latest` is an alias to the current
# stable flash model and is less likely to be congested than a specific
# version string.
FALLBACK_MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-pro",
]

# How many result cards to scroll-collect on the All tab before sending to Gemini.
MAX_CANDIDATES_PER_LEAD = 25
MAX_ALL_TAB_SCROLL_ROUNDS = 4


ALL_TAB_FILTER_PROMPT = """You are identifying employees of an Asterley Bros venue-lead from LinkedIn "All" search results.
LinkedIn's All tab returns people, companies, posts, and schools mixed together. We only care about PEOPLE whose CURRENT or PAST role ties them to the specific lead business.

Lead:
- name: {business_name}
- website: {website}
- address: {address}
- venue_category: {venue_category}

Candidate profiles (numbered 1..N). Each blob is the raw text of one search result card, including name/role/location/current/past lines as LinkedIn rendered them:

{candidates}

Return ONLY JSON matching this schema:
  {{"matches": [{{"index": <1-based int>, "name": "<display name or 'LinkedIn Member'>", "title": "<role title if visible>", "current_company_match": <bool>, "confidence": "high"|"medium"|"low", "reason": "<=100 chars"}}]}}

Rules:
- Include ONLY profiles whose role is clearly at the specific lead business.
- EXCLUDE:
  * Profiles at similarly-named but different businesses (lead "The Connaught Bar" must NOT match "Connaught Wines" or "Connaught House Restaurant")
  * Profiles at clearly different venues that just happen to share a word
  * One-off mentions (school attended, event contributed, unrelated past gig)
  * Company pages, posts, schools — these are not people
- "LinkedIn Member" (redacted private profile) is fine — include if role text clearly ties to the lead.
- Confidence guide:
  * high: current role is explicitly at the lead business
  * medium: past role at the lead, or current role implied
  * low: role is ambiguous but plausibly at the lead
- Return an empty "matches" array if nothing matches. Prefer being strict over generous — false positives poison the outreach pool.
"""


COMPANY_RESOLVE_PROMPT = """You are identifying the correct LinkedIn company page for an Asterley Bros venue-lead.

Lead:
- name: {business_name}
- website: {website}
- address: {address}
- venue_category: {venue_category}

LinkedIn company search results (numbered 1..N). Each blob is the raw text of one search result card:

{{candidates}}

Return ONLY JSON:
  {{"match_index": <1-based int or null if no match>, "confidence": "high"|"medium"|"low", "reason": "<=100 chars>"}}

Rules:
- Match ONLY if the company is clearly the same business as the lead.
- EXCLUDE similarly-named but different businesses.
- If no result clearly matches, return match_index: null.
"""

AGENT_SYSTEM_PROMPT = """You are a browser agent extracting contact and social media data from a LinkedIn company page.

Your goal: find ALL social media profile URLs, phone numbers, email addresses, and the website URL for this company.

Current page URL: {page_url}
Current page text (truncated):
{page_text}

Clickable elements on this page:
{clickable_elements}

Available actions — return ONLY JSON:
1. Click an element: {{"action": "click", "element_index": <int>}}
2. Scroll the page: {{"action": "scroll", "direction": "down"|"up"}}
3. Navigate to a URL: {{"action": "navigate", "url": "<absolute URL>"}}
4. Extract all found data (final step): {{"action": "extract", "data": {{"company_linkedin_url": "...", "company_linkedin_slug": "...", "company_size": "...", "industry": "...", "hq_address": "...", "phone": "...", "email": "...", "website": "...", "instagram_handle": "...", "twitter_handle": "...", "facebook_url": "...", "tiktok_handle": "...", "youtube_url": "..."}}}}
5. Done (nothing more to find): {{"action": "done", "summary": "..."}}

Strategy:
- Start by looking at the current page. If you can see contact info or social links, extract immediately.
- If there is an "About" tab or link, click it — the About page has phone, email, website, and social links.
- If you see a "People" tab, note it but don't navigate there now — employees are collected separately.
- For social media: look for icon links or text links to instagram.com, twitter.com/x.com, facebook.com, tiktok.com, youtube.com.
- For phone: look for tel: links or phone-number patterns.
- For email: look for mailto: links or email patterns.
- Never navigate away from linkedin.com.
- Return "extract" when you have collected all visible data, or "done" if nothing useful is on this page.
- Do NOT fabricate data — only return what you can see on the page.
"""

AGENT_MAX_TEXT_CHARS = 3000
AGENT_MAX_CLICKABLE = 30


class LinkedInSessionExpired(ScraperError):
    """Raised when the stored session is no longer valid."""


class LinkedInBlocked(ScraperError):
    """Raised when LinkedIn shows a captcha, challenge, or rate-limit page."""


class LinkedInCompanyScraper(BaseScraper):
    """Scrape employees from LinkedIn company /people/ pages for known leads."""

    def __init__(
        self,
        config: AppConfig | None = None,
        lead_ids: list[str] | None = None,
        auto_select_count: int = 0,
        dry_run: bool = False,
        all_mode: bool = False,
        daily_cap_override: int | None = None,
        rescrape_days_override: int | None = None,
        no_proxy: bool = False,
        sticky_proxy: bool = False,
    ) -> None:
        super().__init__(config)
        self.linkedin_config = self.config.scraping.linkedin
        # Persistent browser profile directory — stores cookies, localStorage,
        # cache, and fingerprint-relevant state so LinkedIn sees the same
        # device across runs. Replaces the old storage_state JSON approach.
        self.profile_dir = Path("data/linkedin_browser_profile")
        # Kept for backwards-compat with older code paths / log messages.
        self.session_path = Path(self.linkedin_config.session_path)
        self.lead_ids = lead_ids or []
        self.auto_select_count = auto_select_count
        self.dry_run = dry_run
        self.all_mode = all_mode
        self.daily_cap_override = daily_cap_override
        self.rescrape_days_override = rescrape_days_override
        self.no_proxy = no_proxy
        self.sticky_proxy = sticky_proxy
        self.collected_leads: list[Lead] = []
        self.employee_count_total = 0

    @property
    def _rescrape_days(self) -> int:
        if self.rescrape_days_override is not None:
            return self.rescrape_days_override
        return self.linkedin_config.rescrape_after_days

    @property
    def _daily_cap(self) -> int:
        if self.daily_cap_override is not None:
            return self.daily_cap_override
        return self.linkedin_config.max_companies_per_day

    def _sticky_id_path(self) -> Path:
        # Co-locate with the profile dir's parent so cleanup is straightforward.
        return Path("data/linkedin_proxy_sticky_id.txt")

    def _load_or_create_sticky_id(self, create_if_missing: bool) -> str | None:
        """Return a stable sticky proxy-session ID, persisting it next to the
        Playwright storage_state. Ensures save_session and every scrape hit
        the same exit IP (so LinkedIn doesn't invalidate the session).

        When create_if_missing=False and no file exists yet, returns None.
        """
        path = self._sticky_id_path()
        if path.exists():
            sid = path.read_text().strip()
            if sid:
                return sid
        if not create_if_missing:
            return None
        sid = secrets.token_hex(6)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(sid)
        log.info("linkedin_sticky_id_created", path=str(path), session_id=sid)
        return sid

    # ---------------------------------------------------------------- session

    async def _launch_persistent_browser(self, headless: bool = False) -> Any:
        """Open a cloakbrowser persistent context for LinkedIn.

        Persistent profile = stable fingerprint + cookies survive across runs.
        LinkedIn sees one consistent device instead of a fresh browser each
        launch, which prevents the session-revocation we hit with the old
        ephemeral + storage_state approach.
        """
        from cloakbrowser import launch_persistent_context_async
        from src.scrapers.browser import get_proxy_config, get_sticky_proxy_config

        self.profile_dir.mkdir(parents=True, exist_ok=True)

        proxy: dict | None = None
        if not self.no_proxy:
            if self.sticky_proxy:
                sticky_id = self._load_or_create_sticky_id(create_if_missing=True)
                proxy = get_sticky_proxy_config(sticky_id) if sticky_id else get_proxy_config()
            else:
                proxy = get_proxy_config()

        kwargs: dict = {
            "user_data_dir": str(self.profile_dir),
            "headless": headless,
            "locale": "en-GB",
            "timezone": "Europe/London",
            "viewport": {"width": 1280, "height": 720},
        }
        if proxy:
            # Cloakbrowser persistent context accepts proxy as a dict with
            # server/username/password keys. For HTTPS-through-HTTP-proxy,
            # some engines need the auth injected via route handler instead.
            kwargs["proxy"] = proxy
            kwargs["geoip"] = True

        self._context = await launch_persistent_context_async(**kwargs)
        self._browser_engine = "cloakbrowser_persistent"
        self._browser = None
        log.info(
            "linkedin_persistent_browser_ready",
            profile_dir=str(self.profile_dir),
            proxy_at_launch=bool(proxy),
        )
        return self._context

    async def _close_persistent_browser(self) -> None:
        if self._context is not None:
            try:
                await self._context.close()
            except Exception:
                pass
            self._context = None
            log.info("linkedin_persistent_browser_closed")

    async def save_session(self) -> None:
        """Open the persistent profile for manual login. State auto-persists.

        After the user completes login, cookies/localStorage/fingerprint are
        already written to the profile directory. Subsequent scrape runs
        reopen the same profile and are still logged in.

        On a headless VPS, use --vnc-session which launches Xvfb + VNC so
        you can connect from your laptop and log in via a browser window.
        """
        if self.no_proxy:
            log.info(
                "linkedin_session_save_without_proxy",
                msg=(
                    "Saving profile without proxy — future scrapes must also "
                    "run with --no-proxy (or from a consistent IP)."
                ),
            )

        await self._launch_persistent_browser(headless=False)
        ctx = self._context
        assert ctx is not None

        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded")
        log.info(
            "linkedin_session_bootstrap",
            msg="Log in manually. When you land on /feed/, press ENTER in the terminal.",
        )
        await asyncio.get_event_loop().run_in_executor(
            None, input, "Press ENTER once you are logged in and can see /feed/... "
        )
        log.info("linkedin_session_saved", profile_dir=str(self.profile_dir))
        await self._close_persistent_browser()

    async def save_session_vnc(self) -> None:
        """Open a VNC-accessible browser on a headless VPS for manual login.

        Launches Xvfb (virtual framebuffer) and a VNC server so you can
        connect from your laptop, see the browser, and complete LinkedIn login.
        After login, the persistent profile is saved just like --save-session.

        NOTE: Proxy auth can cause issues with Chromium-based browsers on VPS.
        If you get ERR_HTTP_RESPONSE_CODE_FAILURE, run with --no-proxy instead.
        The VPS has a stable IP, so the session will remain valid across runs
        as long as you also use --no-proxy for scraping.

        Requirements on VPS: apt install xvfb x11vnc (or equivalent).
        """
        import subprocess

        try:
            subprocess.run(["which", "Xvfb"], check=True, capture_output=True)
        except Exception:
            log.error(
                "linkedin_vnc_missing_xvfb",
                msg="Xvfb not found. Install: sudo apt install xvfb x11vnc",
            )
            return

        display_num = ":99"
        vnc_port = 5999

        # Start Xvfb
        xvfb_proc = subprocess.Popen(
            ["Xvfb", display_num, "-screen", "0", "1280x720x24", "-ac"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        await asyncio.sleep(1)

        # Set DISPLAY for the browser
        os.environ["DISPLAY"] = display_num

        # Launch browser (non-headless, will render into Xvfb)
        await self._launch_persistent_browser(headless=False)
        ctx = self._context
        assert ctx is not None

        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded")

        # Start VNC server so user can see the display
        vnc_proc = subprocess.Popen(
            ["x11vnc", "-display", display_num, "-nopw", "-forever",
             "-rfbport", str(vnc_port), "-shared"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        await asyncio.sleep(1)

        log.info(
            "linkedin_vnc_session_ready",
            msg=(
                f"VNC server running on port {vnc_port}. "
                f"Connect from your laptop: vnc://<VPS_IP>:{vnc_port} "
                f"(or use a VNC client like Screen Sharing on Mac). "
                f"Log into LinkedIn, then press ENTER here."
            ),
            vnc_port=vnc_port,
        )
        await asyncio.get_event_loop().run_in_executor(
            None, input, f"Press ENTER once you are logged in (VNC :{vnc_port})... "
        )

        log.info("linkedin_vnc_session_saved", profile_dir=str(self.profile_dir))
        await self._close_persistent_browser()

        # Cleanup
        vnc_proc.terminate()
        xvfb_proc.terminate()
        try:
            vnc_proc.wait(timeout=5)
        except Exception:
            vnc_proc.kill()
        try:
            xvfb_proc.wait(timeout=5)
        except Exception:
            xvfb_proc.kill()

    def _ensure_session_exists(self) -> None:
        # A populated profile dir means a previous save-session completed.
        # We check for the presence of any file inside the dir (Firefox profile
        # writes a `prefs.js`, cookies DB, etc. on first run).
        if not self.profile_dir.exists() or not any(self.profile_dir.iterdir()):
            raise LinkedInSessionExpired(
                f"No LinkedIn profile at {self.profile_dir}. "
                "Run: python -m src.scrapers.linkedin --save-session"
            )

    async def _verify_session_valid(self, page: Any) -> None:
        await self._navigate_with_retry(page, SESSION_CHECK_URL)
        await human_pause("navigation")
        current_url = page.url
        if "/login" in current_url or "authwall" in current_url:
            raise LinkedInSessionExpired(
                "Session expired (redirected to /login). "
                "Re-run --save-session to refresh."
            )
        # Additional check for challenge
        if "checkpoint/challenge" in current_url or "add-phone" in current_url:
            raise LinkedInBlocked(f"LinkedIn challenge page: {current_url}")
        log.info("linkedin_session_valid", url=current_url)

    # ---------------------------------------------------------- All-tab search

    async def _scrape_via_all_tab(
        self, page: Any, lead: dict
    ) -> list[LinkedInEmployee]:
        """Search LinkedIn's All tab for the business name, filter via Gemini.

        1. Navigate to /search/results/all/?keywords={business_name}
        2. Scroll a few rounds to load additional result cards
        3. Collect every profile card (anything with an `a[href*='/in/']`)
           along with its raw text blob (name / role / location / current / past)
        4. Send the blobs to Gemini with the business context
        5. Gemini returns the indices of actual employees; build
           LinkedInEmployee records from those.
        """
        business_name = lead.get("business_name") or ""
        if not business_name:
            return []
        lead_id = str(lead.get("id") or "unknown")

        url = ALL_TAB_SEARCH_URL_TEMPLATE.format(keywords=quote_plus(business_name))
        await self._navigate_with_retry(page, url)
        await human_pause("reading_medium")

        try:
            await page.wait_for_selector("a[href*='/in/']", timeout=10000)
        except Exception:
            pass

        candidates = await self._collect_all_tab_candidates(page)

        if not candidates:
            log.info(
                "linkedin_all_tab_empty",
                business=business_name,
                page_url=page.url,
            )
            await self._dump_debug_screenshot(page, lead_id, "all_tab_empty")
            return []

        log.info(
            "linkedin_all_tab_candidates",
            business=business_name,
            candidate_count=len(candidates),
        )

        matches = await self._gemini_filter_employees(lead, candidates)
        log.info(
            "linkedin_all_tab_filter_result",
            business=business_name,
            matched=len(matches),
            total_considered=len(candidates),
        )

        employees: list[LinkedInEmployee] = []
        seen_slugs: set[str] = set()
        for match in matches:
            idx = match.get("index")
            if not isinstance(idx, int) or idx < 1 or idx > len(candidates):
                continue
            cand = candidates[idx - 1]
            if cand["profile_slug"] in seen_slugs:
                continue
            seen_slugs.add(cand["profile_slug"])
            emp = self._build_employee(lead_id, cand, match)
            if emp:
                employees.append(emp)
        return employees

    async def _collect_all_tab_candidates(
        self, page: Any
    ) -> list[dict[str, str]]:
        """Scroll a few rounds and collect profile cards with their raw text.

        Keyed by the stable `/in/{slug}` URL. For each profile link we walk up
        to the nearest `<li>` (LinkedIn's result-card wrapper) and grab the
        container's innerText — that blob contains name, headline, location,
        current/past lines as LinkedIn rendered them.
        """
        collected: dict[str, dict[str, str]] = {}

        for round_idx in range(MAX_ALL_TAB_SCROLL_ROUNDS):
            if len(collected) >= MAX_CANDIDATES_PER_LEAD:
                break

            anchors = await page.query_selector_all("a[href*='/in/']")
            for a in anchors:
                if len(collected) >= MAX_CANDIDATES_PER_LEAD:
                    break

                href = (await a.get_attribute("href") or "").strip()
                slug_match = re.search(r"/in/([^/?#]+)", href)
                if not slug_match:
                    continue
                slug = slug_match.group(1)
                if slug in collected:
                    continue

                profile_url = f"https://www.linkedin.com/in/{slug}/"

                text_blob = ""
                image_url = None
                try:
                    container = await a.evaluate_handle(
                        "el => el.closest('li') || el.closest('div[role=\"listitem\"]') || el.parentElement"
                    )
                    if container:
                        text_blob = await container.evaluate("el => el.innerText || ''")
                        img = await container.query_selector("img")
                        if img:
                            image_url = await img.get_attribute("src")
                except Exception:
                    pass

                text_blob = (text_blob or "").strip()
                if not text_blob:
                    continue

                collected[slug] = {
                    "profile_slug": slug,
                    "profile_url": profile_url,
                    "text_blob": text_blob[:800],
                    "profile_image_url": image_url or "",
                }

            await smooth_scroll(page, "down")
            await asyncio.sleep(self.linkedin_config.scroll_pause_seconds)

        return list(collected.values())

    # ---------------------------------------------- Company page (agentic)

    async def _scrape_company_page(
        self, page: Any, lead: dict
    ) -> LinkedInCompanyData | None:
        """Search for the company's LinkedIn page, then use a Gemini agentic
        loop on the About tab to extract social links, phone, email, website.

        Returns a LinkedInCompanyData if a company page is found and scraped,
        or None if no matching company page exists on LinkedIn.
        """
        business_name = lead.get("business_name") or ""
        if not business_name:
            return None
        lead_id = str(lead.get("id") or "unknown")

        company_slug = await self._resolve_company_slug(page, lead)
        if not company_slug:
            log.info(
                "linkedin_company_not_found",
                business=business_name,
            )
            return None

        company_url = f"https://www.linkedin.com/company/{company_slug}/"
        log.info(
            "linkedin_company_resolved",
            business=business_name,
            slug=company_slug,
        )

        # Navigate to the About tab directly
        about_url = f"{company_url}about/"
        await self._navigate_with_retry(page, about_url)
        await human_pause("reading_medium")

        # Check if About tab loaded; fall back to overview if redirected
        if "/about/" not in page.url:
            log.info("linkedin_company_about_redirect", url=page.url)

        # Run agentic Gemini loop
        company_data = await self._agent_loop(page, lead_id, company_slug, company_url)

        if company_data and not self.dry_run:
            await self._save_company_data(lead_id, company_data)

        return company_data

    async def _resolve_company_slug(
        self, page: Any, lead: dict
    ) -> str | None:
        """Search LinkedIn Companies tab and use Gemini to pick the right one.

        Returns the company slug (for /company/{slug}/) or None.
        """
        business_name = lead.get("business_name") or ""
        if not business_name:
            return None

        url = COMPANY_SEARCH_URL_TEMPLATE.format(keywords=quote_plus(business_name))
        await self._navigate_with_retry(page, url)
        await human_pause("reading_medium")

        # Collect search result cards
        candidates: list[dict[str, str]] = []
        cards = await page.query_selector_all(sel.COMPANY_SEARCH_SELECTORS["result_cards"])
        for i, card in enumerate(cards[:sel.COMPANY_SEARCH_SELECTORS.get("resolver_results_to_consider", 5) or 5]):
            try:
                link_el = await card.query_selector(sel.COMPANY_SEARCH_SELECTORS["card_link_within"])
                name_el = await card.query_selector(sel.COMPANY_SEARCH_SELECTORS["card_name_within"])
                industry_el = await card.query_selector(sel.COMPANY_SEARCH_SELECTORS["card_industry_within"])
                location_el = await card.query_selector(sel.COMPANY_SEARCH_SELECTORS["card_location_within"])

                href = (await link_el.get_attribute("href") or "").strip() if link_el else ""
                slug_match = re.search(r"/company/([^/?#]+)", href)
                slug = slug_match.group(1) if slug_match else ""

                name = (await name_el.inner_text() or "").strip() if name_el else ""
                industry = (await industry_el.inner_text() or "").strip() if industry_el else ""
                location = (await location_el.inner_text() or "").strip() if location_el else ""

                if name:
                    candidates.append({
                        "index": i + 1,
                        "name": name,
                        "slug": slug,
                        "industry": industry,
                        "location": location,
                        "href": href,
                    })
            except Exception:
                continue

        if not candidates:
            return None

        # Use Gemini to pick the right company
        numbered = "\n\n".join(
            f"--- Candidate {c['index']} ---\nname: {c['name']}\nindustry: {c['industry']}\nlocation: {c['location']}"
            for c in candidates
        )
        prompt = COMPANY_RESOLVE_PROMPT.format(
            business_name=business_name,
            website=lead.get("website") or "unknown",
            address=lead.get("address") or lead.get("location_area") or "unknown",
            venue_category=lead.get("venue_category") or "unknown",
            candidates=numbered,
        )

        result = await self._call_gemini(prompt, max_tokens=500)
        if not result:
            return None

        match_idx = result.get("match_index")
        if not isinstance(match_idx, int) or match_idx < 1 or match_idx > len(candidates):
            return None

        confidence = str(result.get("confidence") or "low").lower()
        if not self._accept_confidence(confidence, self.linkedin_config.resolver_min_confidence):
            log.info(
                "linkedin_company_resolve_below_threshold",
                business=business_name,
                confidence=confidence,
                threshold=self.linkedin_config.resolver_min_confidence,
            )
            return None

        return candidates[match_idx - 1]["slug"] or None

    async def _agent_loop(
        self,
        page: Any,
        lead_id: str,
        company_slug: str,
        company_url: str,
    ) -> LinkedInCompanyData | None:
        """Run the Gemini agentic browser loop on the current page.

        Captures page state, sends it to Gemini, receives an action,
        executes the action, and repeats until Gemini returns extract/done
        or max steps are reached.
        """
        max_steps = self.linkedin_config.company_page_agent_max_steps
        extracted_data: dict | None = None

        for step in range(max_steps):
            page_state = await self._capture_page_state(page)
            prompt = AGENT_SYSTEM_PROMPT.format(
                page_url=page.url,
                page_text=page_state["text"][:AGENT_MAX_TEXT_CHARS],
                clickable_elements=page_state["clickable"],
            )

            action_result = await self._call_gemini(prompt, max_tokens=self.linkedin_config.company_page_agent_max_tokens)
            if not action_result:
                log.warning("linkedin_agent_no_response", step=step, lead_id=lead_id)
                break

            action = str(action_result.get("action") or "").lower()
            log.info(
                "linkedin_agent_step",
                step=step,
                action=action,
                lead_id=lead_id,
            )

            if action == "extract":
                extracted_data = action_result.get("data") or {}
                break
            elif action == "done":
                break
            elif action == "click":
                elem_idx = action_result.get("element_index")
                if isinstance(elem_idx, int):
                    await self._agent_click_element(page, elem_idx)
                    await human_pause("reading_medium")
            elif action == "scroll":
                direction = str(action_result.get("direction") or "down")
                await smooth_scroll(page, direction)
                await human_pause("reading_short")
            elif action == "navigate":
                nav_url = str(action_result.get("url") or "")
                if nav_url and "linkedin.com" in nav_url:
                    await self._navigate_with_retry(page, nav_url)
                    await human_pause("reading_medium")
                else:
                    log.warning("linkedin_agent_nav_rejected", url=nav_url)
            else:
                log.warning("linkedin_agent_unknown_action", action=action)
                break

        if not extracted_data:
            log.info("linkedin_agent_no_data_extracted", lead_id=lead_id)
            return None

        try:
            return LinkedInCompanyData(
                lead_id=UUID(lead_id),
                company_linkedin_url=company_url,
                company_linkedin_slug=company_slug,
                company_size=extracted_data.get("company_size") or None,
                industry=extracted_data.get("industry") or None,
                hq_address=extracted_data.get("hq_address") or None,
                phone=extracted_data.get("phone") or None,
                email=extracted_data.get("email") or None,
                website=extracted_data.get("website") or None,
                instagram_handle=self._extract_handle(extracted_data.get("instagram_handle") or "", "instagram.com"),
                twitter_handle=self._extract_handle(extracted_data.get("twitter_handle") or "", "twitter.com", "x.com"),
                facebook_url=extracted_data.get("facebook_url") or None,
                tiktok_handle=self._extract_handle(extracted_data.get("tiktok_handle") or "", "tiktok.com"),
                youtube_url=extracted_data.get("youtube_url") or None,
            )
        except Exception as exc:
            log.warning("linkedin_company_data_build_failed", error=str(exc))
            return None

    async def _capture_page_state(self, page: Any) -> dict[str, str]:
        """Capture current page text and a list of clickable elements."""
        text = ""
        try:
            text = await page.evaluate("() => document.body.innerText || ''")
        except Exception:
            pass

        clickable_items: list[str] = []
        try:
            elements = await page.query_selector_all("a[href], button, [role='button'], [role='tab'], [role='link']")
            for i, el in enumerate(elements[:AGENT_MAX_CLICKABLE]):
                tag = await el.evaluate("el => el.tagName.toLowerCase()")
                text_content = (await el.inner_text() or "").strip()[:80]
                href = (await el.get_attribute("href") or "")[:120]
                clickable_items.append(f"[{i}] <{tag}> text='{text_content}' href='{href}'")
        except Exception:
            pass

        return {
            "text": text[:AGENT_MAX_TEXT_CHARS],
            "clickable": "\n".join(clickable_items),
        }

    async def _agent_click_element(self, page: Any, index: int) -> None:
        """Click the Nth clickable element on the page (0-based index)."""
        try:
            elements = await page.query_selector_all("a[href], button, [role='button'], [role='tab'], [role='link']")
            if 0 <= index < len(elements):
                await elements[index].click()
        except Exception as exc:
            log.warning("linkedin_agent_click_failed", index=index, error=str(exc))

    @staticmethod
    def _extract_handle(value: str, *domains: str) -> str | None:
        """Extract a social handle from a URL or raw string.

        Accepts either a bare handle (@foobar), a slug (foobar),
        or a full URL (https://instagram.com/foobar). Returns the
        slug without leading @, or None.
        """
        if not value:
            return None
        value = value.strip().rstrip("/")
        for domain in domains:
            pattern = rf"(?:https?://)?(?:www\.)?{re.escape(domain)}/([^/?#]+)"
            m = re.search(pattern, value)
            if m:
                handle = m.group(1).lstrip("@")
                return handle or None
        # Bare handle: strip leading @
        handle = value.lstrip("@").split("/")[0]
        return handle if handle else None

    async def _call_gemini(self, prompt: str, max_tokens: int = 4000) -> dict | None:
        """Call Gemini with a prompt and parse the JSON response.

        Uses the same fallback chain as _gemini_filter_employees.
        """
        from google import genai
        from google.genai import errors as genai_errors
        from src.enrichment.analyzer import call_gemini_with_retry

        primary_model = self.config.scraping.enrichment.gemini_model
        model_chain = [primary_model]
        for fb in FALLBACK_MODELS:
            if fb not in model_chain:
                model_chain.append(fb)

        client = genai.Client()
        raw_text = ""
        last_error: Exception | None = None

        for model in model_chain:
            try:
                gen_config: dict = {
                    "max_output_tokens": max_tokens,
                    "temperature": FILTER_TEMPERATURE,
                    "response_mime_type": "application/json",
                }
                if "pro" not in model:
                    gen_config["thinking_config"] = {"thinking_budget": 0}
                response = call_gemini_with_retry(
                    client,
                    model=model,
                    contents=prompt,
                    config=gen_config,
                )
                raw_text = response.text or ""
                if raw_text:
                    break
                last_error = RuntimeError("empty response")
            except genai_errors.ServerError as exc:
                last_error = exc
                continue
            except genai_errors.ClientError as exc:
                last_error = exc
                continue
            except Exception as exc:
                last_error = exc
                continue

        if not raw_text:
            return None

        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            # Try brace-matching fallback
            start = raw_text.find("{")
            if start == -1:
                return None
            depth = 0
            end = start
            for i in range(start, len(raw_text)):
                if raw_text[i] == "{":
                    depth += 1
                elif raw_text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            try:
                return json.loads(raw_text[start:end])
            except json.JSONDecodeError:
                log.warning("linkedin_gemini_parse_failed", raw=raw_text[:200])
                return None

    async def _save_company_data(
        self, lead_id: str, data: LinkedInCompanyData
    ) -> None:
        """Write extracted company data to Firestore: update lead fields."""
        from src.db.firestore import save_linkedin_company_data
        save_linkedin_company_data(lead_id, data)
        log.info(
            "linkedin_company_data_saved",
            lead_id=lead_id,
            company_slug=data.company_linkedin_slug,
            has_phone=bool(data.phone),
            has_email=bool(data.email),
            has_instagram=bool(data.instagram_handle),
            has_twitter=bool(data.twitter_handle),
            has_facebook=bool(data.facebook_url),
            has_tiktok=bool(data.tiktok_handle),
            has_youtube=bool(data.youtube_url),
        )

    async def _gemini_filter_employees(
        self, lead: dict, candidates: list[dict[str, str]]
    ) -> list[dict[str, Any]]:
        """Send candidate blobs to Gemini and return the matched-employee list.

        Tries the configured model first; on a persistent 5xx (after the
        built-in retry loop) falls through FALLBACK_MODELS before giving up.
        """
        from google import genai
        from google.genai import errors as genai_errors
        from src.enrichment.analyzer import call_gemini_with_retry

        primary_model = self.config.scraping.enrichment.gemini_model
        # Chain: primary first, then unique fallbacks
        model_chain = [primary_model]
        for fb in FALLBACK_MODELS:
            if fb not in model_chain:
                model_chain.append(fb)

        threshold = self.linkedin_config.resolver_min_confidence

        numbered = "\n\n".join(
            f"--- Candidate {i + 1} ---\nprofile_url: {c['profile_url']}\n"
            f"{c['text_blob']}"
            for i, c in enumerate(candidates)
        )
        prompt = ALL_TAB_FILTER_PROMPT.format(
            business_name=lead.get("business_name") or "unknown",
            website=lead.get("website") or "unknown",
            address=lead.get("address") or lead.get("location_area") or "unknown",
            venue_category=lead.get("venue_category") or "unknown",
            candidates=numbered,
        )

        client = genai.Client()
        raw_text = ""
        used_model: str | None = None
        last_error: Exception | None = None

        for attempt_idx, model in enumerate(model_chain):
            try:
                # thinking_budget=0 disables "thinking" on flash models so
                # the whole max_output_tokens budget goes to the JSON reply
                # (this task is structured classification — no deep reasoning
                # needed). Pro models reject budget=0; leave thinking on.
                gen_config: dict = {
                    "max_output_tokens": FILTER_MAX_TOKENS,
                    "temperature": FILTER_TEMPERATURE,
                    "response_mime_type": "application/json",
                }
                if "pro" not in model:
                    gen_config["thinking_config"] = {"thinking_budget": 0}
                response = call_gemini_with_retry(
                    client,
                    model=model,
                    contents=prompt,
                    config=gen_config,
                )
                raw_text = response.text or ""
                used_model = model
                if not raw_text:
                    log.warning(
                        "linkedin_filter_empty_response",
                        model=model,
                    )
                    last_error = RuntimeError("empty response")
                    continue
                if attempt_idx > 0:
                    log.info(
                        "linkedin_filter_fallback_ok",
                        used_model=model,
                        primary_model=primary_model,
                        fallback_tier=attempt_idx,
                    )
                break
            except genai_errors.ServerError as exc:
                log.warning(
                    "linkedin_filter_model_overloaded",
                    model=model,
                    error=str(exc)[:160],
                )
                last_error = exc
                continue
            except genai_errors.ClientError as exc:
                # 4xx from a specific model (404 unknown model, 400 bad
                # config, etc.) is often model-specific — log and try next.
                log.warning(
                    "linkedin_filter_model_client_error",
                    model=model,
                    error=str(exc)[:160],
                )
                last_error = exc
                continue
            except Exception as exc:
                # Truly unexpected errors — network, SDK bugs. Try next.
                log.warning("linkedin_filter_gemini_error", model=model, error=str(exc))
                last_error = exc
                continue

        if not raw_text:
            log.warning(
                "linkedin_filter_all_models_failed",
                tried=model_chain,
                last_error=str(last_error)[:200] if last_error else None,
            )
            return []

        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError:
            log.warning(
                "linkedin_filter_parse_failed",
                model=used_model,
                raw=raw_text[:200],
            )
            return []

        raw_matches = []
        if isinstance(parsed, dict):
            raw_matches = parsed.get("matches") or []
        if not isinstance(raw_matches, list):
            return []

        # Filter by min confidence threshold from config.
        accepted: list[dict[str, Any]] = []
        for m in raw_matches:
            if not isinstance(m, dict):
                continue
            if not self._accept_confidence(m.get("confidence"), threshold):
                continue
            accepted.append(m)
        return accepted

    def _build_employee(
        self, lead_id: str, candidate: dict[str, str], match: dict[str, Any]
    ) -> LinkedInEmployee | None:
        raw_name = str(match.get("name") or "").strip()
        name = raw_name or "LinkedIn Member"
        title = (str(match.get("title") or "").strip()) or None
        is_dm, seniority = self._classify_seniority(title)

        confidence_str = str(match.get("confidence") or "medium").lower()
        try:
            confidence = LinkedInConfidence(confidence_str)
        except ValueError:
            confidence = LinkedInConfidence.MEDIUM

        try:
            return LinkedInEmployee(
                lead_id=UUID(lead_id),
                company_linkedin_url=None,
                source="all_tab",
                name=name,
                name_lower=name.lower(),
                profile_url=candidate["profile_url"],
                profile_slug=candidate["profile_slug"],
                profile_image_url=(candidate.get("profile_image_url") or None),
                title=title,
                title_lower=(title.lower() if title else None),
                role_seniority=seniority,
                is_decision_maker=is_dm,
                location=None,
                connection_degree=None,
                confidence=confidence,
                notes=(match.get("reason") or None),
            )
        except Exception as exc:
            log.warning("linkedin_employee_build_failed", error=str(exc))
            return None

    @staticmethod
    def _accept_confidence(reported: Any, threshold: str) -> bool:
        """True if `reported` confidence meets or exceeds `threshold`."""
        if not isinstance(reported, str):
            return False
        return _CONFIDENCE_RANK.get(reported, -1) >= _CONFIDENCE_RANK.get(threshold, 99)

    def _classify_seniority(self, title: str | None) -> tuple[bool, str | None]:
        if not title:
            return False, None
        low = title.lower()
        for kw in self.linkedin_config.decision_maker_keywords:
            if kw in low:
                if kw in {"owner", "founder", "ceo", "md", "managing director"}:
                    return True, "owner"
                if kw in {"director", "head of", "general manager", "gm"}:
                    return True, "director"
                if "manager" in kw or kw == "buyer" or kw == "procurement":
                    return True, "manager"
                return True, "senior_staff"
        return False, "staff"

    # -------------------------------------------------------------- debug

    async def _dump_debug_screenshot(self, page: Any, lead_id: str, tag: str) -> None:
        out_dir = Path("data")
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"debug_linkedin_{lead_id}_{tag}.png"
        try:
            await page.screenshot(path=str(path), full_page=True)
            log.warning("linkedin_debug_screenshot", path=str(path), lead_id=lead_id)
        except Exception:
            pass

    # -------------------------------------------------------------- progress

    def _emit_progress(
        self,
        done: int,
        total: int,
        business_name: str,
        status: str,
        employees: int,
    ) -> None:
        """Structured per-lead progress line for tail-able backfill runs."""
        log.info(
            "linkedin_progress",
            done=done,
            total=total,
            pct=round(100 * done / max(1, total), 1),
            employees_cum=self.employee_count_total,
            status=status,
            employees_found=employees,
            current_lead=business_name,
        )

    # -------------------------------------------------------------- orchestration

    def _pick_lead_ids(self) -> list[str]:
        if self.lead_ids:
            return self.lead_ids
        if self.all_mode:
            picks = get_all_leads_needing_linkedin_scrape(
                rescrape_after_days=self._rescrape_days,
            )
            return [str(l["id"]) for l in picks if l.get("id")]
        if self.auto_select_count > 0:
            picks = get_leads_needing_linkedin_scrape(
                self.auto_select_count,
                rescrape_after_days=self._rescrape_days,
            )
            return [str(l["id"]) for l in picks if l.get("id")]
        return []

    async def scrape(self) -> list[Lead]:
        self._ensure_session_exists()

        lead_ids = self._pick_lead_ids()
        if not lead_ids:
            log.info("linkedin_no_leads_selected")
            return []

        # Bulk --all mode bypasses the per-run cap; single/auto modes keep it.
        if not self.all_mode:
            max_run = self.linkedin_config.max_companies_per_run
            lead_ids = lead_ids[:max_run]

        scraped_today = count_linkedin_scrapes_today()
        daily_cap = self._daily_cap
        remaining = max(0, daily_cap - scraped_today)
        if remaining == 0:
            log.warning(
                "linkedin_daily_cap_reached",
                scraped_today=scraped_today,
                daily_cap=daily_cap,
            )
            return []
        lead_ids = lead_ids[:remaining]
        total_targets = len(lead_ids)

        log.info(
            "linkedin_run_start",
            mode="all" if self.all_mode else ("auto" if self.auto_select_count else "explicit"),
            targets=total_targets,
            daily_cap=daily_cap,
            scraped_today=scraped_today,
            dry_run=self.dry_run,
        )

        ctx = await self._launch_persistent_browser(headless=False)
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()

        await self._verify_session_valid(page)

        scrape_company = self.linkedin_config.scrape_company_page

        for idx, lead_id in enumerate(lead_ids, start=1):
            lead = get_lead_by_id(lead_id)
            if not lead:
                log.warning("linkedin_lead_missing", lead_id=lead_id)
                continue

            business_name = lead.get("business_name") or "<unknown>"
            per_lead_status = "failed"
            per_lead_employees = 0

            try:
                if scrape_company:
                    # Run All-tab employees and company-page scrape concurrently
                    # on separate tabs within the same browser context.
                    company_page = await ctx.new_page()

                    employees_task = self._scrape_via_all_tab(page, lead)
                    company_task = self._scrape_company_page(company_page, lead)

                    results = await asyncio.gather(
                        employees_task,
                        company_task,
                        return_exceptions=True,
                    )

                    employees = results[0] if not isinstance(results[0], Exception) else []
                    company_data = results[1] if not isinstance(results[1], Exception) else None

                    if isinstance(results[0], LinkedInBlocked):
                        raise results[0]
                    if isinstance(results[0], ScraperError):
                        log.error("linkedin_scrape_error", lead_id=lead_id, error=str(results[0]))

                    if isinstance(results[1], Exception) and not isinstance(results[1], ScraperError):
                        log.warning("linkedin_company_page_error", lead_id=lead_id, error=str(results[1]))

                    try:
                        await company_page.close()
                    except Exception:
                        pass
                else:
                    employees = await self._scrape_via_all_tab(page, lead)
                    company_data = None

            except LinkedInBlocked as exc:
                log.error("linkedin_blocked_during_scrape", lead_id=lead_id, error=str(exc))
                if not self.dry_run:
                    update_lead_linkedin_status(lead_id, "rate_limited")
                per_lead_status = "rate_limited"
                self._emit_progress(idx, total_targets, business_name, per_lead_status, 0)
                if self.linkedin_config.abort_on_captcha:
                    break
                continue
            except ScraperError as exc:
                log.error("linkedin_scrape_error", lead_id=lead_id, error=str(exc))
                if not self.dry_run:
                    update_lead_linkedin_status(lead_id, "failed")
                per_lead_status = "failed"
                self._emit_progress(idx, total_targets, business_name, per_lead_status, 0)
                continue

            per_lead_employees = len(employees)
            if self.dry_run:
                log.info(
                    "linkedin_dry_run_result",
                    lead_id=lead_id,
                    employees=per_lead_employees,
                    decision_makers=sum(1 for e in employees if e.is_decision_maker),
                    company_data=company_data.model_dump(mode="json") if company_data else None,
                    sample=[
                        {"name": e.name, "title": e.title, "confidence": e.confidence.value}
                        for e in employees[:3]
                    ],
                )
                per_lead_status = "success" if employees else "not_found"
            else:
                saved = 0
                for emp in employees:
                    if save_linkedin_employee(emp):
                        saved += 1
                per_lead_status = "success" if employees else "not_found"
                update_lead_linkedin_status(
                    lead_id,
                    per_lead_status,
                    linkedin_scraped_at=datetime.now().isoformat(),
                    linkedin_employee_count=per_lead_employees,
                )
                log_activity(
                    "linkedin_company_scraped",
                    entity_type="lead",
                    entity_id=lead_id,
                    details={
                        "source": "all_tab",
                        "employees_found": per_lead_employees,
                        "employees_saved": saved,
                        "decision_makers": sum(1 for e in employees if e.is_decision_maker),
                        "company_page_scraped": company_data is not None,
                        "social_channels": sum(1 for k in ("instagram_handle", "twitter_handle", "facebook_url", "tiktok_handle", "youtube_url") if getattr(company_data, k, None)) if company_data else 0,
                    },
                )
                self.employee_count_total += per_lead_employees

            self.collected_leads.append(lead)
            self._emit_progress(idx, total_targets, business_name, per_lead_status, per_lead_employees)
            await self._rate_limit(self.config.rate_limits.linkedin_rpm)

        try:
            await page.close()
        except Exception:
            pass
        await self._close_persistent_browser()
        log.info(
            "linkedin_scrape_done",
            leads_processed=len(self.collected_leads),
            employees_total=self.employee_count_total,
            company_page_enabled=scrape_company,
        )
        return self.collected_leads


# -------------------------------------------------------------------- CLI


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="LinkedIn employee scraper")
    parser.add_argument(
        "--save-session",
        action="store_true",
        help="Open a browser for manual login and persist storage_state.",
    )
    parser.add_argument(
        "--vnc-session",
        action="store_true",
        help=(
            "Open a VNC-accessible browser on a headless VPS for manual login. "
            "Requires Xvfb + x11vnc installed on the VPS. "
            "Connect via VNC client (e.g. Mac Screen Sharing) to port 5999."
        ),
    )
    parser.add_argument(
        "--lead-ids",
        type=str,
        default="",
        help="Comma-separated lead UUIDs to scrape.",
    )
    parser.add_argument(
        "--auto-select-count",
        type=int,
        default=0,
        help="If --lead-ids is empty, auto-select N highest-score leads missing LinkedIn data.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Bulk backfill: scrape every lead missing LinkedIn data. Bypasses max_companies_per_run.",
    )
    parser.add_argument(
        "--daily-cap",
        type=int,
        default=None,
        help="Override scraping.linkedin.max_companies_per_day for this run.",
    )
    parser.add_argument(
        "--rescrape-days",
        type=int,
        default=None,
        help="Override scraping.linkedin.rescrape_after_days for this run.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write to Firestore; log what would be saved.",
    )
    parser.add_argument(
        "--no-proxy",
        action="store_true",
        help=(
            "Skip the env-configured proxy (PROXY_HOST/PROXY_PORT). "
            "Use when the proxy is unreachable. WARNING: the session will be "
            "tied to whatever IP you're using — keep subsequent runs on the "
            "same IP or LinkedIn may invalidate the session."
        ),
    )
    parser.add_argument(
        "--sticky-proxy",
        action="store_true",
        help=(
            "Rewrite PROXY_USERNAME via PROXY_STICKY_TEMPLATE so every run "
            "hits the same exit IP. Only enable when you know your proxy "
            "provider's exact sticky-session format and have set "
            "PROXY_STICKY_TEMPLATE accordingly. Default off — most providers "
            "reject unknown formats with 407."
        ),
    )
    return parser.parse_args()


async def _amain() -> None:
    args = _parse_args()
    config = load_config()

    lead_ids = [x.strip() for x in args.lead_ids.split(",") if x.strip()]

    scraper = LinkedInCompanyScraper(
        config=config,
        lead_ids=lead_ids,
        auto_select_count=args.auto_select_count,
        dry_run=args.dry_run,
        all_mode=args.all,
        daily_cap_override=args.daily_cap,
        rescrape_days_override=args.rescrape_days,
        no_proxy=args.no_proxy,
        sticky_proxy=args.sticky_proxy,
    )

    if args.save_session:
        await scraper.save_session()
        return

    if args.vnc_session:
        await scraper.save_session_vnc()
        return

    await scraper.run()


def main() -> None:
    asyncio.run(_amain())


if __name__ == "__main__":
    main()
