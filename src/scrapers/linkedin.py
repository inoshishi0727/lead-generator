"""LinkedIn employee scraper (All-tab search).

Given an existing lead, navigates to LinkedIn's All-tab search for the
business name, collects every profile card on the results page, and asks
Gemini to identify which profiles are actually current or past employees.
No company-page lookup — many small venues don't have one, and People in
the All-tab surface employees directly via their job titles.

Auth uses Playwright storage_state — no stored credentials. Bootstrap via:
    python -m src.scrapers.linkedin --save-session
which opens a browser for manual login, then dumps cookies/localStorage to
data/linkedin_session.json. Future runs load that file and skip login.
When the session expires, re-run --save-session.

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
from src.db.models import Lead, LinkedInConfidence, LinkedInEmployee
from src.scrapers.base import BaseScraper, ScraperError
from src.scrapers.humanize.scroll import smooth_scroll
from src.scrapers.humanize.timing import human_pause
from src.scrapers.selectors import linkedin_selectors as sel

log = structlog.get_logger()


SESSION_CHECK_URL = "https://www.linkedin.com/feed/"
ALL_TAB_SEARCH_URL_TEMPLATE = (
    "https://www.linkedin.com/search/results/all/?keywords={keywords}&origin=SWITCH_SEARCH_VERTICAL"
)

# Gemini filter — small task, small budget. Not config knobs.
FILTER_MAX_TOKENS = 1200
FILTER_TEMPERATURE = 0.1
_CONFIDENCE_RANK = {"none": 0, "low": 1, "medium": 2, "high": 3}

# Fallback model chain. If the configured `gemini_model` returns 5xx after
# the in-built retry loop, we cycle through these in order. Different models
# often run on different infrastructure so one being overloaded doesn't
# necessarily mean the next is too.
FALLBACK_MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
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
        return self.session_path.with_name("linkedin_proxy_sticky_id.txt")

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

    async def save_session(self) -> None:
        """Open a real browser for manual login, then persist storage_state.

        Creates a sticky proxy session ID on first run so subsequent scrapes
        land on the same exit IP and LinkedIn doesn't invalidate the session.
        """
        if self.no_proxy:
            log.warning(
                "linkedin_session_save_without_proxy",
                msg=(
                    "Saving session without proxy. Future scrapes must also run "
                    "without proxy (or from the same IP) — LinkedIn will invalidate "
                    "a session seen from a very different origin."
                ),
            )
            sticky_id = None
        elif self.sticky_proxy:
            sticky_id = self._load_or_create_sticky_id(create_if_missing=True)
        else:
            sticky_id = None

        ctx = await self._launch_browser(
            headless=False,
            use_proxy=not self.no_proxy,
            sticky_session_id=sticky_id,
        )
        page = await ctx.new_page()
        await page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded")
        log.info(
            "linkedin_session_bootstrap",
            msg="Log in manually. When you land on /feed/, press ENTER in the terminal.",
        )
        # Block here until the user confirms login is complete.
        await asyncio.get_event_loop().run_in_executor(
            None, input, "Press ENTER once you are logged in and can see /feed/... "
        )
        self.session_path.parent.mkdir(parents=True, exist_ok=True)
        await ctx.storage_state(path=str(self.session_path))
        log.info("linkedin_session_saved", path=str(self.session_path))
        await self._close_browser()

    def _ensure_session_exists(self) -> None:
        if not self.session_path.exists():
            raise LinkedInSessionExpired(
                f"No LinkedIn session at {self.session_path}. "
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

        # Wait for any profile link to show up — the All tab might render
        # companies/posts first, but profile links are what we care about.
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
        collected: dict[str, dict[str, str]] = {}  # slug -> data

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

                # Walk up to the enclosing <li> (search-result wrapper). If
                # there's no <li> ancestor, fall back to the anchor itself.
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
                    # The anchor alone isn't enough context for Gemini.
                    continue

                collected[slug] = {
                    "profile_slug": slug,
                    "profile_url": profile_url,
                    "text_blob": text_blob[:800],  # cap to keep prompt small
                    "profile_image_url": image_url or "",
                }

            # Scroll to reveal more results
            await smooth_scroll(page, "down")
            await asyncio.sleep(self.linkedin_config.scroll_pause_seconds)

        return list(collected.values())

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
                response = call_gemini_with_retry(
                    client,
                    model=model,
                    contents=prompt,
                    config={
                        "max_output_tokens": FILTER_MAX_TOKENS,
                        "temperature": FILTER_TEMPERATURE,
                        "response_mime_type": "application/json",
                    },
                )
                raw_text = response.text or ""
                used_model = model
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
            except Exception as exc:
                # Non-5xx errors (auth, bad request, etc.) won't be fixed by
                # swapping model — stop the chain.
                log.warning("linkedin_filter_gemini_error", model=model, error=str(exc))
                last_error = exc
                break

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

        sticky_id = None
        if not self.no_proxy and self.sticky_proxy:
            sticky_id = self._load_or_create_sticky_id(create_if_missing=False)
            if sticky_id is None:
                log.warning(
                    "linkedin_no_sticky_id",
                    msg=(
                        "No sticky proxy session ID found. Run --save-session "
                        "with --sticky-proxy first so login and scrapes share "
                        "the same exit IP."
                    ),
                )

        ctx = await self._launch_browser(
            headless=False,
            storage_state=str(self.session_path),
            use_proxy=not self.no_proxy,
            sticky_session_id=sticky_id,
        )
        page = await ctx.new_page()

        await self._verify_session_valid(page)

        for idx, lead_id in enumerate(lead_ids, start=1):
            lead = get_lead_by_id(lead_id)
            if not lead:
                log.warning("linkedin_lead_missing", lead_id=lead_id)
                continue

            business_name = lead.get("business_name") or "<unknown>"
            per_lead_status = "failed"
            per_lead_employees = 0

            try:
                employees = await self._scrape_via_all_tab(page, lead)
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
                    },
                )
                self.employee_count_total += per_lead_employees

            self.collected_leads.append(lead)
            self._emit_progress(idx, total_targets, business_name, per_lead_status, per_lead_employees)
            await self._rate_limit(self.config.rate_limits.linkedin_rpm)

        await page.close()
        log.info(
            "linkedin_scrape_done",
            leads_processed=len(self.collected_leads),
            employees_total=self.employee_count_total,
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

    await scraper.run()


def main() -> None:
    asyncio.run(_amain())


if __name__ == "__main__":
    main()
