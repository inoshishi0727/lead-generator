"""Email extraction from business websites — four-tier strategy.

Tier 1: Scan the Google Maps listing for visible email.
Tier 2: Visit the business homepage, scrape mailto: links and regex patterns.
Tier 3: Follow contact/about page links and scan those too.
Tier 4: Use Gemini AI to extract emails from page text (obfuscated, JS-rendered, etc.).
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any

import structlog

from src.config.loader import load_config

log = structlog.get_logger()

_last_gemini_call: float = 0.0

EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")

FALSE_POSITIVES = {
    "noreply",
    "no-reply",
    "example",
    "test",
    "admin",
    "support",
    "webmaster",
    "postmaster",
    "mailer-daemon",
    "root",
}

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"}

CONTACT_SLUGS = [
    "/contact",
    "/contact-us",
    "/about",
    "/about-us",
    "/get-in-touch",
    "/enquiries",
    "/enquiry",
]

PAGE_TIMEOUT_MS = 15000
PAGE_SETTLE_MS = 2000


def _is_valid_email(email: str) -> bool:
    """Filter out common false-positive email addresses."""
    local = email.split("@")[0].lower()
    if local in FALSE_POSITIVES:
        return False
    # Filter image filenames that match email-like patterns
    if any(email.lower().endswith(ext) for ext in IMAGE_EXTENSIONS):
        return False
    # Must have valid TLD (at least 2 chars)
    tld = email.rsplit(".", 1)[-1]
    if len(tld) < 2 or len(tld) > 10:
        return False
    return True


async def extract_emails_from_page(page: Any) -> list[str]:
    """Scan the current page for email addresses.

    Checks:
    1. <a href="mailto:..."> links
    2. Regex scan on visible page text
    """
    emails: set[str] = set()

    # Method 1: mailto links
    try:
        mailto_links = await page.query_selector_all('a[href^="mailto:"]')
        for link in mailto_links:
            href = await link.get_attribute("href")
            if href:
                raw = href.replace("mailto:", "").split("?")[0].strip()
                if raw and _is_valid_email(raw):
                    emails.add(raw.lower())
    except Exception:
        log.debug("mailto_scan_failed")

    # Method 2: regex on visible text
    try:
        body_text = await page.inner_text("body")
        for match in EMAIL_PATTERN.findall(body_text):
            if _is_valid_email(match):
                emails.add(match.lower())
    except Exception:
        log.debug("text_scan_failed")

    return list(emails)


async def _find_contact_links(page: Any, base_url: str) -> list[str]:
    """Find links to contact/about pages on the current page."""
    urls: list[str] = []
    try:
        links = await page.query_selector_all("a[href]")
        for link in links:
            href = await link.get_attribute("href")
            if not href:
                continue
            href_lower = href.lower()
            for slug in CONTACT_SLUGS:
                if slug in href_lower:
                    # Normalize to absolute URL
                    if href.startswith("http"):
                        urls.append(href)
                    elif href.startswith("/"):
                        urls.append(base_url.rstrip("/") + href)
                    break
    except Exception:
        log.debug("contact_link_scan_failed")

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            unique.append(u)
    return unique[:5]  # Limit to 5 pages


async def extract_email_from_website(page: Any, url: str) -> str | None:
    """Orchestrate email extraction from a business website.

    1. Open the URL in a new tab
    2. Scan the homepage for emails
    3. If none found, follow contact/about links and scan those
    4. Return the first valid email found
    5. Close the tab when done
    """
    context = page.context
    new_page = await context.new_page()

    try:
        # Navigate to homepage and wait for JS to render
        try:
            await new_page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT_MS)
        except Exception:
            # Fall back to domcontentloaded if networkidle times out
            try:
                await new_page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
            except Exception:
                log.warning("homepage_navigate_failed", url=url)
                return None
        await asyncio.sleep(PAGE_SETTLE_MS / 1000)

        # Scan homepage
        emails = await extract_emails_from_page(new_page)
        if emails:
            log.info("email_found_homepage", url=url, email=emails[0])
            return emails[0]

        # Tier 3: Find and visit contact/about pages
        base_url = url.split("/", 3)[:3]
        base = "/".join(base_url) if len(base_url) >= 3 else url
        contact_links = await _find_contact_links(new_page, base)

        for link_url in contact_links:
            try:
                try:
                    await new_page.goto(
                        link_url, wait_until="networkidle", timeout=PAGE_TIMEOUT_MS
                    )
                except Exception:
                    await new_page.goto(
                        link_url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS
                    )
                await asyncio.sleep(PAGE_SETTLE_MS / 1000)
                emails = await extract_emails_from_page(new_page)
                if emails:
                    log.info("email_found_contact_page", url=link_url, email=emails[0])
                    return emails[0]
            except Exception:
                log.debug("contact_page_failed", url=link_url)
                continue

        # Tier 4: Gemini AI extraction
        config = load_config()
        if config.scraping.email_extraction.gemini_enabled:
            try:
                try:
                    await new_page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT_MS)
                except Exception:
                    await new_page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
                await asyncio.sleep(PAGE_SETTLE_MS / 1000)
                body_text = await new_page.inner_text("body")
                email = await _extract_email_with_gemini(body_text)
                if email:
                    log.info("email_found_gemini", url=url, email=email)
                    return email
            except Exception:
                log.debug("gemini_email_extraction_failed", url=url)

        log.debug("no_email_found", url=url)
        return None

    finally:
        await new_page.close()


async def _extract_email_with_gemini(page_text: str) -> str | None:
    """Use Gemini AI to extract a business email from page text.

    Handles obfuscated formats, JS-rendered text, footer content, etc.
    """
    global _last_gemini_call

    config = load_config()
    max_chars = config.scraping.email_extraction.gemini_max_text_chars
    gemini_rpm = config.rate_limits.gemini_rpm

    # Rate limiting
    min_interval = 60.0 / gemini_rpm
    now = time.monotonic()
    elapsed = now - _last_gemini_call
    if elapsed < min_interval:
        await asyncio.sleep(min_interval - elapsed)

    truncated = page_text[:max_chars]

    try:
        from google import genai

        client = genai.Client()
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=(
                "Extract any business email address from this webpage content. "
                "Return ONLY the email address, or NONE if not found.\n\n"
                f"{truncated}"
            ),
            config={
                "max_output_tokens": 50,
                "temperature": 0.0,
            },
        )
        _last_gemini_call = time.monotonic()

        result = (response.text or "").strip()
        if not result or result.upper() == "NONE":
            return None

        # Validate against existing pattern
        match = EMAIL_PATTERN.search(result)
        if match and _is_valid_email(match.group()):
            return match.group().lower()

        return None

    except Exception:
        log.debug("gemini_email_api_error", exc_info=True)
        return None
