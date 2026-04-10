"""Website content fetching with proxy, browser fallback, PDF/image support, and popup dismissal."""

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
                "/our-menu", "/the-bar", "/bars", "/eat", "/kitchen",
                "/beverage", "/beverages", "/sample-menu", "/whats-on",
                "/about", "/about-us", "/contact", "/contact-us"]

# Link text patterns that indicate useful pages to follow
LINK_PATTERNS = re.compile(
    r"menu|drink|cocktail|wine|spirit|bar|dining|food|eat|kitchen|negroni|spritz|aperit|vermouth|amaro|about|story|contact|beverage|carte|list",
    re.IGNORECASE,
)

# Image link patterns — only collect images that look like menus
IMAGE_MENU_PATTERNS = re.compile(
    r"menu|drink|cocktail|wine|bar|food|eat|spirit|beverage",
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

# PDF relevance — sort PDFs whose URL contains these terms first
PDF_PRIORITY_PATTERN = re.compile(
    r"drink|cocktail|wine|bar|spirit|menu|beverage",
    re.IGNORECASE,
)


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


async def _discover_links(
    page, base_url: str, max_links: int = 6
) -> tuple[list[str], list[str], list[str]]:
    """Find internal links on the current page that look relevant.

    Returns (html_links, pdf_links, image_links).

    PDF links: collected before the same-domain guard so CDN/external-hosted
    menu PDFs (Squarespace, Wix, etc.) are not silently dropped.

    Image links: only collected when URL path or anchor text matches
    IMAGE_MENU_PATTERNS so we don't pull logos/hero photos.
    """
    base_domain = urlparse(base_url).netloc
    found: list[str] = []
    pdfs: list[str] = []
    images: list[str] = []
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

            if parsed.scheme not in ("http", "https"):
                continue

            # --- PDF check BEFORE domain guard ---
            # Many venues host menus on CDN subdomains or third-party services
            # (Squarespace, Wix, Wixstatic, Strikingly, etc.). We collect these
            # regardless of domain and fetch them via direct HTTP download.
            if full_url.lower().endswith(".pdf"):
                if full_url not in seen:
                    seen.add(full_url)
                    pdfs.append(full_url)
                continue

            # --- Image menu check BEFORE domain guard ---
            # Only collect images whose URL or anchor text looks like a menu.
            if any(full_url.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")):
                if IMAGE_MENU_PATTERNS.search(text) or IMAGE_MENU_PATTERNS.search(parsed.path):
                    if full_url not in seen:
                        seen.add(full_url)
                        images.append(full_url)
                continue

            # Skip other binary/non-HTML resources
            if any(full_url.lower().endswith(ext) for ext in (".zip", ".gif", ".svg")):
                continue

            # Same-domain guard for HTML pages only
            if parsed.netloc != base_domain:
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

    # Sort PDFs: those with drinks/cocktail/wine/bar in the URL come first
    pdfs.sort(key=lambda u: (0 if PDF_PRIORITY_PATTERN.search(u) else 1))

    return found, pdfs, images


async def _fetch_pdf_text(url: str, config: EnrichmentConfig) -> str:
    """Download a PDF via httpx and extract text.

    Primary: pdfminer/fitz text extraction.
    Fallback: if the PDF is image-only (scanned menu), render first two pages
    to PNG and extract text via Gemini Vision.
    """
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

            import fitz  # pymupdf

            doc = fitz.open(tmp)
            text = "\n".join(p.get_text() for p in doc)

            if len(text.strip()) >= 100:
                doc.close()
                log.debug("pdf_text_extracted", url=url, chars=len(text))
                return text

            # --- Scanned / image-only PDF — fallback to Gemini Vision ---
            log.debug("pdf_scanned_fallback", url=url, text_chars=len(text.strip()))
            vision_parts: list[str] = []
            for page_num in range(min(2, len(doc))):
                page = doc[page_num]
                # Render at 150 DPI — keeps PNG under ~500KB, within Gemini inline limit
                mat = fitz.Matrix(150 / 72, 150 / 72)
                pix = page.get_pixmap(matrix=mat)
                png_bytes = pix.tobytes("png")
                page_text = await _extract_text_via_vision(
                    png_bytes, "image/png", config, source=f"PDF page {page_num + 1}"
                )
                if page_text:
                    vision_parts.append(page_text)
            doc.close()

            combined = "\n".join(vision_parts)
            log.debug("pdf_vision_extracted", url=url, chars=len(combined))
            return combined

        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

    except Exception as exc:
        log.debug("pdf_fetch_failed", url=url, error=str(exc))
        return ""


async def _fetch_image_text(url: str, config: EnrichmentConfig) -> str:
    """Download a menu image and extract text via Gemini Vision."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return ""
            if len(resp.content) > 5_000_000:
                log.debug("image_too_large", url=url, size=len(resp.content))
                return ""

        # Determine mime type from URL extension
        ext = url.lower().split(".")[-1].split("?")[0]
        mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg",
                    "png": "image/png", "webp": "image/webp"}
        mime_type = mime_map.get(ext, "image/jpeg")

        text = await _extract_text_via_vision(
            resp.content, mime_type, config, source=url
        )
        log.debug("image_text_extracted", url=url, chars=len(text))
        return text

    except Exception as exc:
        log.debug("image_fetch_failed", url=url, error=str(exc))
        return ""


async def _extract_text_via_vision(
    image_bytes: bytes,
    mime_type: str,
    config: EnrichmentConfig,
    source: str = "",
) -> str:
    """Send an image to Gemini Vision and return extracted menu text.

    Used for:
    - Image menu files (.jpg/.png linked from venue websites)
    - Scanned/image-only PDF pages (no text layer)

    Returns empty string if no menu text is found or on error.
    """
    try:
        from google import genai
        from google.genai import types

        client = genai.Client()

        prompt = (
            "This is an image from a hospitality venue website — it may be a menu, drinks list, "
            "cocktail board, wine list, or food menu. "
            "Extract ALL text visible in the image exactly as it appears: "
            "every item name, description, ingredient, and price. "
            "Format as a plain text list, one item per line. "
            "If the image contains no menu or drinks text (e.g. it is a logo, photo, or decoration), "
            "return exactly: NO_MENU_TEXT"
        )

        response = client.models.generate_content(
            model=config.gemini_model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt,
            ],
        )

        extracted = (response.text or "").strip()
        if extracted == "NO_MENU_TEXT" or not extracted:
            return ""

        log.debug("vision_extracted", source=source, chars=len(extracted))
        return extracted

    except Exception as exc:
        log.debug("vision_extraction_failed", source=source, error=str(exc))
        return ""


def _sort_parts_by_relevance(parts: list[str]) -> list[str]:
    """Sort collected page/PDF parts so menu-relevant content comes first.

    Priority:
      1. PDF parts (--- PDF: ... ---)
      2. HTML pages whose path matches menu/drinks/cocktail keywords
      3. Homepage
      4. Everything else (about, contact, etc.)

    This ensures that if Gemini's input is truncated, it's the generic
    About/homepage prose that gets cut — not the drinks menu.
    """
    MENU_KEYWORDS = re.compile(
        r"menu|drink|cocktail|wine|bar|spirit|food|eat|kitchen|beverage|dining",
        re.IGNORECASE,
    )

    def priority(part: str) -> int:
        header = part.split("\n")[0]
        if "--- PDF:" in header or "--- IMAGE MENU:" in header:
            return 0
        if "--- PAGE:" in header and MENU_KEYWORDS.search(header):
            return 1
        if "homepage" in header.lower():
            return 2
        return 3

    return sorted(parts, key=priority)


async def fetch_website_text(
    url: str,
    config: EnrichmentConfig,
) -> str:
    """Fetch text content from a venue website.

    Strategy:
    1. Launch browser (Camoufox -> CloakBrowser fallback) with proxy
    2. Visit homepage, dismiss popups
    3. Discover relevant internal links (menu, drinks, about, etc.)
       - PDFs collected before same-domain check (catches CDN-hosted menus)
       - Menu-relevant images collected for Vision extraction
    4. Visit discovered links + fallback static paths
    5. Download and extract PDF menu links (Vision fallback for scanned PDFs)
    6. Extract text from image menus via Gemini Vision
    7. Sort parts so menu content comes first before truncation
    8. Concatenate all text for Gemini analysis

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
        discovered, pdf_links, image_links = await _discover_links(page, url)
        log.debug(
            "links_discovered",
            url=url,
            count=len(discovered),
            pdfs=len(pdf_links),
            images=len(image_links),
            links=[urlparse(u).path for u in discovered],
        )

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

        # Track seen PDFs/images to avoid duplicates across homepage + sub-pages
        seen_pdf_urls: set[str] = set(pdf_links)
        seen_image_urls: set[str] = set(image_links)

        # Step 4: Visit each HTML page; also collect any additional PDF/image links found
        for target_url in to_visit:
            try:
                await page.goto(target_url, wait_until="networkidle", timeout=timeout_ms)
                await _dismiss_popups(page, timeout=1000)
                text = (await page.inner_text("body")).strip()
                if text and len(text) > 50:
                    path = urlparse(target_url).path
                    collected_parts.append(f"--- PAGE: {path} ---\n{text}")
                    log.debug("page_fetched", url=target_url, chars=len(text))

                # Re-run link discovery on sub-pages to find deeper PDF/image links
                _, sub_pdfs, sub_images = await _discover_links(page, target_url)
                for pdf_url in sub_pdfs:
                    if pdf_url not in seen_pdf_urls:
                        seen_pdf_urls.add(pdf_url)
                        pdf_links.append(pdf_url)
                for img_url in sub_images:
                    if img_url not in seen_image_urls:
                        seen_image_urls.add(img_url)
                        image_links.append(img_url)

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

    # Re-sort PDFs after sub-page discovery (new ones may have been added)
    pdf_links.sort(key=lambda u: (0 if PDF_PRIORITY_PATTERN.search(u) else 1))

    # Step 5: Fetch PDF menus (up to 4, sorted by relevance)
    for pdf_url in pdf_links[:4]:
        text = await _fetch_pdf_text(pdf_url, config)
        if text and len(text) > 50:
            path = urlparse(pdf_url).path
            collected_parts.append(f"--- PDF: {path} ---\n{text}")

    # Step 6: Extract text from image menus via Gemini Vision (up to 3)
    for img_url in image_links[:3]:
        text = await _fetch_image_text(img_url, config)
        if text and len(text) > 20:
            path = urlparse(img_url).path
            collected_parts.append(f"--- IMAGE MENU: {path} ---\n{text}")

    # Step 7: Sort parts so menu-relevant content comes first
    # This ensures truncation cuts generic prose, not the drinks/food menu
    collected_parts = _sort_parts_by_relevance(collected_parts)

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
