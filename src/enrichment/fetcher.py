"""Website content fetching with proxy, browser fallback, PDF support, and popup dismissal."""

from __future__ import annotations

import os
import re
import tempfile
from urllib.parse import urljoin, urlparse

import structlog

from src.config.loader import EnrichmentConfig

log = structlog.get_logger()

# Common paths for hospitality venues — tried in order after homepage
STATIC_PATHS = ["/menu", "/menus", "/drinks", "/drinks-menu", "/cocktails",
                "/cocktail-menu", "/wine-list", "/wine-menu", "/bar",
                "/food-drink", "/food-and-drink", "/dining", "/restaurant",
                "/our-menu", "/the-bar", "/bars", "/about", "/about-us",
                "/contact", "/contact-us"]

# Link text patterns that indicate useful pages to follow
LINK_PATTERNS = re.compile(
    r"menu|drink|cocktail|wine|spirit|bar|dining|food|negroni|spritz|aperit|vermouth|amaro|about|story|contact",
    re.IGNORECASE,
)

# Selectors for common popups (cookie consent, location gates, age gates)
POPUP_SELECTORS = [
    # Cookie consent
    "button:has-text('Accept all')",
    "button:has-text('Accept cookies')",
    "button:has-text('Accept')",
    "button:has-text('Got it')",
    "button:has-text('I agree')",
    "button:has-text('Allow all')",
    "[id*='cookie'] button",
    "[class*='cookie'] button:has-text('Accept')",
    "[class*='cookie'] button:has-text('OK')",
    "[class*='consent'] button:has-text('Accept')",
    # Location / region gates
    "button:has-text('United Kingdom')",
    "button:has-text('UK')",
    "button:has-text('Enter site')",
    "button:has-text('Enter')",
    "button:has-text('Proceed')",
    "button:has-text('Continue')",
    # Age gates
    "button:has-text('I am over 18')",
    "button:has-text('Yes')",
    "button:has-text('I am of legal')",
    # Generic close
    "[aria-label='Close']",
    "button:has-text('Close')",
]


async def _dismiss_popups(page, timeout: int = 2000) -> None:
    """Try to click common cookie/location/age-gate popups."""
    for selector in POPUP_SELECTORS:
        try:
            el = await page.wait_for_selector(selector, timeout=timeout, state="visible")
            if el:
                await el.click()
                await page.wait_for_timeout(500)
                log.debug("popup_dismissed", selector=selector)
                return
        except Exception:
            continue


async def _discover_links(page, base_url: str, max_links: int = 6) -> tuple[list[str], list[str]]:
    """Find internal links on the current page that look relevant.

    Returns (html_links, pdf_links).
    """
    base_domain = urlparse(base_url).netloc
    found: list[str] = []
    pdfs: list[str] = []
    seen: set[str] = set()

    try:
        links = await page.query_selector_all("a[href]")
        for link in links:
            href = await link.get_attribute("href")
            text = (await link.inner_text()).strip() if link else ""

            if not href:
                continue

            full_url = urljoin(base_url, href)
            parsed = urlparse(full_url)

            if parsed.netloc != base_domain:
                continue
            if parsed.scheme not in ("http", "https"):
                continue

            # Collect PDFs separately
            if full_url.lower().endswith(".pdf"):
                if full_url not in seen:
                    seen.add(full_url)
                    pdfs.append(full_url)
                continue

            if any(full_url.lower().endswith(ext) for ext in (".jpg", ".png", ".zip", ".gif", ".svg")):
                continue

            path = parsed.path.lower()
            if not (LINK_PATTERNS.search(text) or LINK_PATTERNS.search(path)):
                continue

            if path in seen or path == "/" or path == "":
                continue
            seen.add(path)
            found.append(full_url)

            if len(found) >= max_links:
                break
    except Exception:
        pass

    return found, pdfs


async def _fetch_pdf_text(url: str) -> str:
    """Download a PDF via httpx and extract text with pymupdf."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return ""
            if len(resp.content) > 10_000_000:
                log.debug("pdf_too_large", url=url, size=len(resp.content))
                return ""

        tmp = tempfile.mktemp(suffix=".pdf")
        try:
            with open(tmp, "wb") as f:
                f.write(resp.content)

            import fitz
            doc = fitz.open(tmp)
            text = "\n".join(p.get_text() for p in doc)
            doc.close()
            log.debug("pdf_text_extracted", url=url, chars=len(text))
            return text
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

    except Exception as exc:
        log.debug("pdf_fetch_failed", url=url, error=str(exc))
        return ""


async def fetch_website_text(
    url: str,
    config: EnrichmentConfig,
) -> str:
    """Fetch text content from a venue website.

    Strategy:
    1. Launch browser (Camoufox -> CloakBrowser fallback) with proxy
    2. Visit homepage, dismiss popups
    3. Discover relevant internal links (menu, drinks, about, etc.)
    4. Visit discovered links + fallback static paths
    5. Download and extract PDF menu links
    6. Concatenate all text for Gemini analysis

    Returns empty string on total failure.
    """
    from src.scrapers.browser import close_browser, get_proxy_config, launch_browser

    if not url:
        return ""

    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    collected_parts: list[str] = []
    visited: set[str] = set()
    browser = None
    engine = "camoufox"

    try:
        browser, engine = await launch_browser(headless=config.headless)

        proxy = get_proxy_config()
        context_kwargs = {
            "viewport": {"width": 1280, "height": 720},
            "locale": "en-GB",
            "timezone_id": "Europe/London",
            "geolocation": {"latitude": 51.5074, "longitude": -0.1278},
            "permissions": ["geolocation"],
        }
        if proxy:
            context_kwargs["proxy"] = proxy
        context = await browser.new_context(**context_kwargs)
        page = await context.new_page()
        timeout_ms = config.camoufox_timeout_seconds * 1000

        # Step 1: Visit homepage
        try:
            await page.goto(url, wait_until="networkidle", timeout=timeout_ms)
        except Exception:
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            except Exception as e:
                log.warning("homepage_fetch_failed", url=url, error=str(e))
                await context.close()
                await close_browser(browser, engine)
                return ""

        # Dismiss cookie/location popups
        await _dismiss_popups(page)

        homepage_text = (await page.inner_text("body")).strip()
        if homepage_text:
            collected_parts.append(f"--- PAGE: homepage ---\n{homepage_text}")
            log.debug("page_fetched", url=url, chars=len(homepage_text))
        visited.add(urlparse(url).path or "/")

        # Step 2: Discover links from homepage
        discovered, pdf_links = await _discover_links(page, url)
        log.debug("links_discovered", url=url, count=len(discovered),
                  pdfs=len(pdf_links),
                  links=[urlparse(u).path for u in discovered])

        # Step 3: Build visit list — discovered links first, then static fallbacks
        to_visit: list[str] = []
        for link_url in discovered:
            path = urlparse(link_url).path
            if path not in visited:
                to_visit.append(link_url)
                visited.add(path)

        for static_path in STATIC_PATHS:
            if static_path not in visited:
                to_visit.append(urljoin(url, static_path))
                visited.add(static_path)

        max_subpages = 6
        to_visit = to_visit[:max_subpages]

        # Step 4: Visit each HTML page
        for target_url in to_visit:
            try:
                await page.goto(target_url, wait_until="networkidle", timeout=timeout_ms)
                await _dismiss_popups(page, timeout=1000)
                text = (await page.inner_text("body")).strip()
                if text and len(text) > 50:
                    path = urlparse(target_url).path
                    collected_parts.append(f"--- PAGE: {path} ---\n{text}")
                    log.debug("page_fetched", url=target_url, chars=len(text))
            except Exception as e:
                log.debug("page_fetch_failed", url=target_url, error=str(e))
                continue

        await context.close()

    except Exception as e:
        log.warning("browser_fetch_failed", url=url, engine=engine, error=str(e))
        return ""
    finally:
        if browser:
            await close_browser(browser, engine)

    # Step 5: Fetch PDF menus (no browser needed — direct download)
    for pdf_url in pdf_links[:2]:
        text = await _fetch_pdf_text(pdf_url)
        if text and len(text) > 50:
            path = urlparse(pdf_url).path
            collected_parts.append(f"--- PDF: {path} ---\n{text}")

    full_text = "\n\n".join(collected_parts)

    if len(full_text) > config.gemini_max_input_chars:
        full_text = full_text[: config.gemini_max_input_chars]

    log.info(
        "website_text_fetched",
        url=url,
        pages=len(collected_parts),
        total_chars=len(full_text),
    )
    return full_text
