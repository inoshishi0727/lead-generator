"""Website content fetching via Camoufox for lead enrichment."""

from __future__ import annotations

import re
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


async def _discover_links(page, base_url: str, max_links: int = 6) -> list[str]:
    """Find internal links on the current page that look relevant."""
    base_domain = urlparse(base_url).netloc
    found: list[str] = []
    seen: set[str] = set()

    try:
        links = await page.query_selector_all("a[href]")
        for link in links:
            href = await link.get_attribute("href")
            text = (await link.inner_text()).strip() if link else ""

            if not href:
                continue

            # Resolve relative URLs
            full_url = urljoin(base_url, href)
            parsed = urlparse(full_url)

            # Must be same domain, http(s), not an anchor or file
            if parsed.netloc != base_domain:
                continue
            if parsed.scheme not in ("http", "https"):
                continue
            if any(full_url.lower().endswith(ext) for ext in (".pdf", ".jpg", ".png", ".zip")):
                continue

            # Check if link text or path looks relevant
            path = parsed.path.lower()
            if not (LINK_PATTERNS.search(text) or LINK_PATTERNS.search(path)):
                continue

            # Deduplicate by path
            if path in seen or path == "/" or path == "":
                continue
            seen.add(path)
            found.append(full_url)

            if len(found) >= max_links:
                break
    except Exception:
        pass

    return found


async def fetch_website_text(
    url: str,
    config: EnrichmentConfig,
) -> str:
    """Fetch text content from a venue website using Camoufox.

    Strategy:
    1. Visit the homepage
    2. Discover relevant internal links (menu, drinks, about, etc.)
    3. Visit discovered links + fallback static paths
    4. Concatenate all text for Gemini analysis

    Returns empty string on total failure.
    """
    from camoufox.async_api import AsyncCamoufox

    if not url:
        return ""

    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    collected_parts: list[str] = []
    visited: set[str] = set()

    try:
        async with AsyncCamoufox(headless=config.headless) as browser:
            context = await browser.new_context(
                viewport={"width": 1280, "height": 720},
            )
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
                    return ""

            homepage_text = (await page.inner_text("body")).strip()
            if homepage_text:
                collected_parts.append(f"--- PAGE: homepage ---\n{homepage_text}")
                log.debug("page_fetched", url=url, chars=len(homepage_text))
            visited.add(urlparse(url).path or "/")

            # Step 2: Discover links from homepage
            discovered = await _discover_links(page, url)
            log.debug("links_discovered", url=url, count=len(discovered),
                      links=[urlparse(u).path for u in discovered])

            # Step 3: Build visit list — discovered links first, then static fallbacks
            to_visit: list[str] = []
            for link_url in discovered:
                path = urlparse(link_url).path
                if path not in visited:
                    to_visit.append(link_url)
                    visited.add(path)

            # Add static paths as fallback (only if not already visited)
            for static_path in STATIC_PATHS:
                if static_path not in visited:
                    to_visit.append(urljoin(url, static_path))
                    visited.add(static_path)

            # Limit total pages to visit
            max_subpages = 6
            to_visit = to_visit[:max_subpages]

            # Step 4: Visit each page
            for target_url in to_visit:
                try:
                    await page.goto(target_url, wait_until="networkidle", timeout=timeout_ms)
                    text = (await page.inner_text("body")).strip()
                    if text and len(text) > 50:  # Skip empty/tiny pages
                        path = urlparse(target_url).path
                        collected_parts.append(f"--- PAGE: {path} ---\n{text}")
                        log.debug("page_fetched", url=target_url, chars=len(text))
                except Exception as e:
                    log.debug("page_fetch_failed", url=target_url, error=str(e))
                    continue

            await context.close()

    except Exception as e:
        log.warning("browser_fetch_failed", url=url, error=str(e))
        return ""

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
