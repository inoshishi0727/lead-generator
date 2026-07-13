"""Website content fetching with proxy, browser fallback, PDF/image support, and popup dismissal."""

from __future__ import annotations

import asyncio
import hashlib
import os
import re
import tempfile
import time
from urllib.parse import urljoin, urlparse

import structlog

from dataclasses import dataclass

from src.config.loader import EnrichmentConfig

log = structlog.get_logger()


@dataclass
class FetchResult:
    """Result of fetching a venue website for enrichment."""
    text: str
    menu_url: str | None = None
    menu_text: str | None = None
    asset_bytes: bytes | None = None
    asset_mime: str | None = None

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

# Tighter than LINK_PATTERNS: the visible text of buttons/links we're willing to CLICK
# to reach a menu on JS/SPA sites. Kept narrow so we don't click "Book Now" / "Gift Card".
MENU_TRIGGER_PATTERN = re.compile(
    r"discover\s+menu|see\s+(the\s+)?menu|view\s+(the\s+)?menu|our\s+menu|"
    r"\b(menus?|drinks?|cocktails?|wine\s*list|food\s*menu|carte|dining)\b",
    re.IGNORECASE,
)

# Client-side (SPA) 404 / not-found bodies — routers return HTTP 200 with these,
# so we must not collect them as content.
NOT_FOUND_PATTERN = re.compile(
    r"page not found|forgot to add the page to the router|404\b|no such page|couldn'?t find",
    re.IGNORECASE,
)

# Legal/privacy/compliance documents we never want to fetch.
# Matches against URL path AND anchor text. Privacy PDFs were polluting the
# contact field (e.g. "Data Privacy Manager" being picked up as the venue
# contact) and allergen docs add noise without helping menu fit.
EXCLUDED_DOC_PATTERN = re.compile(
    r"privacy|gdpr|cookie|terms|t-?and-?c|legal|policy|disclaimer|imprint|allergen",
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
                # Drop privacy/legal/allergen PDFs — they pollute contact info
                if EXCLUDED_DOC_PATTERN.search(parsed.path) or EXCLUDED_DOC_PATTERN.search(text):
                    log.debug("doc_excluded", url=full_url, kind="pdf", text=text[:60])
                    continue
                if full_url not in seen:
                    seen.add(full_url)
                    pdfs.append(full_url)
                continue

            # --- Image menu check BEFORE domain guard ---
            # Only collect images whose URL or anchor text looks like a menu.
            if any(full_url.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")):
                if EXCLUDED_DOC_PATTERN.search(parsed.path) or EXCLUDED_DOC_PATTERN.search(text):
                    log.debug("doc_excluded", url=full_url, kind="image", text=text[:60])
                    continue
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


async def _download_asset(url: str) -> tuple[bytes | None, str | None]:
    """Download a menu PDF/image so it can be mirrored to storage.

    Returns (bytes, mime) for supported types under 10 MB, else (None, None).
    """
    import httpx

    low = url.lower().split("?")[0]
    if low.endswith(".pdf"):
        mime = "application/pdf"
    elif low.endswith((".jpg", ".jpeg")):
        mime = "image/jpeg"
    elif low.endswith(".png"):
        mime = "image/png"
    elif low.endswith(".webp"):
        mime = "image/webp"
    else:
        return None, None

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(url)
        if resp.status_code != 200 or len(resp.content) > 10_000_000:
            return None, None
        return resp.content, mime
    except Exception as exc:
        log.debug("asset_download_failed", url=url, error=str(exc))
        return None, None


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

        from src.enrichment.analyzer import call_gemini_with_retry

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

        response = call_gemini_with_retry(
            client,
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


MENU_PATH_PATTERN = re.compile(
    r"menu|drink|cocktail|wine|bar|beverage",
    re.IGNORECASE,
)


def _looks_like_404(text: str) -> bool:
    """True if a page body looks like a not-found / empty route. SPA & CMS sites return
    HTTP 200 with a 'Page Not Found' body — sometimes verbose (buried under nav/footer) —
    which must not be treated as content."""
    if not text:
        return True
    t = text.strip()
    if len(t) < 60:
        return True
    m = NOT_FOUND_PATTERN.search(t)
    if not m:
        return False
    # A real 404: the not-found message sits early in the page (nav aside), or the page is short.
    return m.start() < 400 or len(t) < 800


# Cloudflare / Akamai / generic bot-challenge interstitials — HTTP 200 with a
# "prove you're human" body instead of the real page. Treated as a transient
# block so the fetch retries on a fresh residential proxy IP.
BOTWALL_PATTERN = re.compile(
    r"just a moment|verify you are (?:a )?human|checking your browser|"
    r"attention required|enable javascript and cookies|access denied|"
    r"cf-ray|cloudflare|ddos protection|are you a robot",
    re.IGNORECASE,
)


def _looks_like_botwall(text: str) -> bool:
    """True if a page body looks like a bot-challenge / block wall (Cloudflare et al.)."""
    if not text:
        return False
    t = text.strip()
    m = BOTWALL_PATTERN.search(t)
    if not m:
        return False
    # Real content that merely mentions "cloudflare" in a footer is long; a challenge
    # page is short and the phrase sits near the top.
    return len(t) < 1500 or m.start() < 600


async def _menu_trigger_texts(page, limit: int = 4) -> list[str]:
    """Visible text of clickable elements (button / link / role) that look like menu
    triggers — used to CLICK through JS/SPA sites where the menu isn't a plain <a href>."""
    texts: list[str] = []
    seen: set[str] = set()
    try:
        els = await page.query_selector_all(
            "a, button, [role='button'], [role='link'], [onclick]"
        )
        for el in els:
            try:
                if not await el.is_visible():
                    continue
                t = (await el.inner_text()).strip()
            except Exception:
                continue
            key = t.lower()
            if not t or len(t) > 40 or key in seen:
                continue
            if MENU_TRIGGER_PATTERN.search(t):
                seen.add(key)
                texts.append(t)
                if len(texts) >= limit:
                    break
    except Exception:
        pass
    return texts


async def fetch_website_text(
    url: str,
    config: EnrichmentConfig,
    listing_mode: bool = False,
) -> FetchResult:
    """Fetch text content from a website.

    Two modes:
    - Full crawl (default): visit homepage + sub-pages + guessed menu paths,
      pull PDF/image menus. Used for per-venue enrichment.
    - listing_mode=True: read the JS-rendered article/homepage text ONLY (scroll
      to trigger lazy-loaded venue cards, no sub-page crawl). Used for the initial
      fetch of a listicle/blog URL, whose text is then mined for venue names.

    Both share a bot-wall-aware launch (Cloudflare et al. → retry on a fresh
    residential proxy IP) and, in full crawl, a wall-clock budget.

    Returns a FetchResult; FetchResult(text="") on total failure.
    """
    from src.scrapers.browser import close_browser, get_proxy_config, launch_browser

    if not url:
        return FetchResult(text="")

    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    collected_parts: list[str] = []
    visited: set[str] = set()
    browser = None
    engine = "camoufox"
    discovered_html_links: list[str] = []
    start = time.monotonic()
    budget_s = config.fetch_budget_seconds

    def _over_budget() -> bool:
        return (time.monotonic() - start) > budget_s

    try:
        from src.scrapers.orchestrator import _is_transient
        from src.scrapers.base import TransientScraperError

        proxy = get_proxy_config()
        context_kwargs = {
            # Camoufox controls the viewport at the window level; passing an explicit
            # viewport makes it call Browser.setDefaultViewport, which it rejects.
            "no_viewport": True,
            "locale": "en-GB",
            "timezone_id": "Europe/London",
            "geolocation": {"latitude": 51.5074, "longitude": -0.1278},
            "permissions": ["geolocation"],
        }
        timeout_ms = (
            config.listing_timeout_seconds if listing_mode else config.camoufox_timeout_seconds
        ) * 1000
        subpage_timeout_ms = config.subpage_timeout_seconds * 1000

        async def _launch_and_load(use_proxy: bool):
            # Camoufox/Firefox ignores a context-level proxy — it must be set at launch
            # time (see src/scrapers/browser.py). So we relaunch the whole browser per
            # attempt: proxy on, then direct as a fallback.
            br, eng = await launch_browser(
                headless=config.headless,
                proxy=proxy if (use_proxy and proxy) else None,
            )
            try:
                ctx = await br.new_context(**context_kwargs)
                pg = await ctx.new_page()
                # Step 1: Visit homepage
                try:
                    await pg.goto(url, wait_until="networkidle", timeout=timeout_ms)
                except Exception:
                    await pg.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                # Bot-challenge interstitial? Give it a beat to auto-clear (camoufox +
                # residential IP passes most managed challenges), then re-check; if still
                # walled, raise transient so we retry on a fresh proxy IP.
                for _ in range(3):
                    if not _looks_like_botwall((await pg.inner_text("body")).strip()):
                        break
                    await pg.wait_for_timeout(5000)
                else:
                    log.warning("botwall_detected", url=url)
                    raise TransientScraperError(f"botwall: {url}")
                return br, eng, ctx, pg
            except Exception:
                await close_browser(br, eng)
                raise

        # Homepage load is the flaky make-or-break step. Retry through the proxy on
        # transient errors, then fall back to a direct (no-proxy) connection so a single
        # bad proxy hop can't blank out an otherwise-reachable site (-> empty menu).
        loaded = False
        last_error: Exception | None = None
        if proxy:
            for attempt in range(2):
                try:
                    browser, engine, context, page = await _launch_and_load(use_proxy=True)
                    loaded = True
                    break
                except Exception as e:
                    last_error, browser = e, None
                    if not _is_transient(e):
                        break
                    if attempt == 0:
                        await asyncio.sleep(3)
        if not loaded:
            try:
                browser, engine, context, page = await _launch_and_load(use_proxy=False)
                loaded = True
                if proxy:
                    log.warning("fetch_proxy_fallback_direct", url=url)
            except Exception as e:
                last_error, browser = e, None

        if not loaded:
            log.warning("homepage_fetch_failed", url=url, error=str(last_error))
            return FetchResult(text="")

        # Dismiss cookie/location popups
        await _dismiss_popups(page)

        homepage_text = (await page.inner_text("body")).strip()
        if homepage_text:
            collected_parts.append(f"--- PAGE: homepage ---\n{homepage_text}")
            log.debug("page_fetched", url=url, chars=len(homepage_text))
        visited.add(urlparse(url).path or "/")

        # Listing mode: this URL is a blog/listicle whose text we mine for venue
        # names. Trigger lazy-loaded venue cards with a human-like scroll, clear any
        # stacked cookie/age walls, and return the article text — NO menu sub-page
        # crawl, no PDF/image extraction.
        if listing_mode:
            body = homepage_text
            try:
                from src.scrapers.humanize.scroll import scroll_like_human
                await _dismiss_popups(page, timeout=1500)  # 2nd pass: stacked gates
                await scroll_like_human(page, total_distance=6000)
                try:
                    await page.wait_for_load_state("networkidle", timeout=timeout_ms)
                except Exception:
                    await page.wait_for_timeout(1500)
                body = (await page.inner_text("body")).strip()
            except Exception as e:
                log.debug("listing_scroll_failed", url=url, error=str(e))
            try:
                await context.close()
            except Exception:
                pass
            best = body if len(body) >= len(homepage_text) else homepage_text
            log.info("listing_text_fetched", url=url, chars=len(best))
            return FetchResult(text=best[: config.gemini_max_input_chars])

        # Step 2: Discover links from homepage
        discovered, pdf_links, image_links = await _discover_links(page, url)
        discovered_html_links = list(discovered)
        log.debug(
            "links_discovered",
            url=url,
            count=len(discovered),
            pdfs=len(pdf_links),
            images=len(image_links),
            links=[urlparse(u).path for u in discovered],
        )

        # Menu trigger texts (buttons / JS links) — captured on the homepage before we
        # navigate away, so we can click through SPA sites where the menu is not an <a href>.
        menu_triggers = await _menu_trigger_texts(page)
        if menu_triggers:
            log.debug("menu_triggers_found", url=url, triggers=menu_triggers)

        # Step 3: Visit list = the real discovered links only. Guessed STATIC_PATHS are a
        # gated last resort (Step 4a) so we don't hop through /menu, /drinks-menu, ... on SPAs.
        to_visit: list[str] = []
        for link_url in discovered:
            path = urlparse(link_url).path
            if path not in visited:
                to_visit.append(link_url)
                visited.add(path)

        max_subpages = 6
        to_visit = to_visit[:max_subpages]

        # Track seen PDFs/images to avoid duplicates across homepage + sub-pages
        seen_pdf_urls: set[str] = set(pdf_links)
        seen_image_urls: set[str] = set(image_links)
        deep_menu_links: list[str] = []  # menu sub-category links found ON menu pages

        # Step 4: Visit each HTML page; also collect any additional PDF/image links found
        for target_url in to_visit:
            if _over_budget():
                break
            try:
                await page.goto(target_url, wait_until="domcontentloaded", timeout=subpage_timeout_ms)
                await _dismiss_popups(page, timeout=1000)
                text = (await page.inner_text("body")).strip()
                if text and len(text) > 50 and not _looks_like_404(text):
                    path = urlparse(target_url).path
                    collected_parts.append(f"--- PAGE: {path} ---\n{text}")
                    log.debug("page_fetched", url=target_url, chars=len(text))

                # Re-run link discovery on sub-pages to find deeper PDF/image links
                sub_html, sub_pdfs, sub_images = await _discover_links(page, target_url)
                for pdf_url in sub_pdfs:
                    if pdf_url not in seen_pdf_urls:
                        seen_pdf_urls.add(pdf_url)
                        pdf_links.append(pdf_url)
                for img_url in sub_images:
                    if img_url not in seen_image_urls:
                        seen_image_urls.add(img_url)
                        image_links.append(img_url)

                # If THIS is a menu page, queue its menu-matching sub-links to go one level deeper.
                if MENU_PATH_PATTERN.search(urlparse(target_url).path):
                    for sub in sub_html:
                        sp = urlparse(sub).path
                        if sp not in visited and MENU_PATH_PATTERN.search(sp):
                            visited.add(sp)
                            deep_menu_links.append(sub)

            except Exception as e:
                log.debug("page_fetch_failed", url=target_url, error=str(e))
                continue

        # Step 4-deep: follow menu sub-category links one extra level (cap 4).
        for target_url in deep_menu_links[:4]:
            if _over_budget():
                break
            try:
                await page.goto(target_url, wait_until="domcontentloaded", timeout=subpage_timeout_ms)
                await _dismiss_popups(page, timeout=1000)
                text = (await page.inner_text("body")).strip()
                if text and len(text) > 50 and not _looks_like_404(text):
                    collected_parts.append(f"--- PAGE: {urlparse(target_url).path} ---\n{text}")
                    log.debug("page_fetched_deep", url=target_url, chars=len(text))
            except Exception as e:
                log.debug("page_fetch_failed", url=target_url, error=str(e))
                continue

        # Step 4b: Click menu triggers that aren't plain <a href> links (JS / SPA navigation).
        # Real navigation — done BEFORE any path guessing. Re-anchor to the homepage per click.
        got_click_content = False
        for trig in menu_triggers[:3]:
            if _over_budget():
                break
            label = f"click:{trig.lower()}"
            if label in visited:
                continue
            visited.add(label)
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                await _dismiss_popups(page, timeout=1000)
                await page.get_by_text(trig, exact=True).first.click(timeout=8000)
                try:
                    await page.wait_for_load_state("networkidle", timeout=timeout_ms)
                except Exception:
                    await page.wait_for_timeout(2500)
                text = (await page.inner_text("body")).strip()
                if text and len(text) > 50 and not _looks_like_404(text):
                    got_click_content = True
                    collected_parts.append(f"--- PAGE (clicked '{trig}') ---\n{text}")
                    log.debug("menu_click_fetched", trigger=trig, chars=len(text))
                    cur = page.url
                    if MENU_PATH_PATTERN.search(urlparse(cur).path):
                        discovered_html_links.append(cur)
            except Exception as e:
                log.debug("menu_click_failed", trigger=trig, error=str(e))
                continue

        # Step 4a: Guessed common paths — LAST resort, only if real navigation (discovered links
        # + clicks) found nothing. Abort the instant a guess returns a client-side 404 body, so we
        # never keep hopping /menu, /drinks-menu, ... on JS/SPA sites.
        if not got_click_content:
            shell_sigs: set[str] = set()
            shell_repeats = 0
            for static_path in STATIC_PATHS[:5]:
                if _over_budget() or shell_repeats >= 2:
                    break
                if static_path in visited:
                    continue
                visited.add(static_path)
                target_url = urljoin(url, static_path)
                try:
                    await page.goto(target_url, wait_until="domcontentloaded", timeout=subpage_timeout_ms)
                    await _dismiss_popups(page, timeout=1000)
                    text = (await page.inner_text("body")).strip()
                    if _looks_like_404(text):
                        log.debug("spa_404_stop_guessing", url=target_url)
                        break
                    # SPA shell that isn't a 404 body: every guessed route returns the
                    # same page (which _looks_like_404 misses). Detect the repeat by
                    # signature and stop guessing instead of hopping all paths.
                    sig = hashlib.md5(f"{len(text)}:{text[:200]}".encode()).hexdigest()
                    if sig in shell_sigs:
                        shell_repeats += 1
                        log.debug("spa_shell_repeat", url=target_url)
                        continue
                    shell_sigs.add(sig)
                    if text and len(text) > 50:
                        collected_parts.append(f"--- PAGE: {static_path} ---\n{text}")
                        log.debug("page_fetched", url=target_url, chars=len(text))
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
        return FetchResult(text="")
    finally:
        if browser:
            await close_browser(browser, engine)

    # Re-sort PDFs after sub-page discovery (new ones may have been added)
    pdf_links.sort(key=lambda u: (0 if PDF_PRIORITY_PATTERN.search(u) else 1))

    # Step 5: Fetch PDF menus (sorted by relevance). Keep the top menu PDF even when
    # over budget — it's usually the whole menu — but trim the rest.
    pdf_cap = 1 if _over_budget() else 3
    for pdf_url in pdf_links[:pdf_cap]:
        text = await _fetch_pdf_text(pdf_url, config)
        if text and len(text) > 50:
            path = urlparse(pdf_url).path
            collected_parts.append(f"--- PDF: {path} ---\n{text}")

    # Step 6: Extract text from image menus via Gemini Vision (skip when over budget —
    # Vision is the slowest step).
    img_cap = 0 if _over_budget() else 2
    for img_url in image_links[:img_cap]:
        text = await _fetch_image_text(img_url, config)
        if text and len(text) > 20:
            path = urlparse(img_url).path
            collected_parts.append(f"--- IMAGE MENU: {path} ---\n{text}")

    # Step 7: Sort parts so menu-relevant content comes first
    # This ensures truncation cuts generic prose, not the drinks/food menu
    collected_parts = _sort_parts_by_relevance(collected_parts)

    # Menu text = the menu-relevant parts (PDF/image OCR + menu/clicked pages), kept whole and
    # BEFORE whole-site truncation, so we can show the actual items on our site.
    menu_markers = ("--- PDF:", "--- IMAGE MENU:", "--- PAGE (clicked")
    menu_parts = [
        p for p in collected_parts
        if p.startswith(menu_markers)
        or (p.startswith("--- PAGE:") and MENU_PATH_PATTERN.search(p.split("\n", 1)[0]))
    ]
    menu_text: str | None = "\n\n".join(menu_parts).strip() or None
    if menu_text and len(menu_text) > config.gemini_max_input_chars:
        menu_text = menu_text[: config.gemini_max_input_chars]

    full_text = "\n\n".join(collected_parts)

    if len(full_text) > config.gemini_max_input_chars:
        full_text = full_text[: config.gemini_max_input_chars]

    # Determine best menu URL (PDF first, then image, then HTML menu page)
    menu_url: str | None = None
    if pdf_links:
        menu_url = pdf_links[0]
    elif image_links:
        menu_url = image_links[0]
    else:
        for link in discovered_html_links:
            if MENU_PATH_PATTERN.search(urlparse(link).path):
                menu_url = link
                break

    # Download the chosen menu asset's bytes (PDF/image) so it can be mirrored to storage.
    asset_bytes: bytes | None = None
    asset_mime: str | None = None
    if menu_url:
        asset_bytes, asset_mime = await _download_asset(menu_url)

    log.info(
        "website_text_fetched",
        url=url,
        pages=len(collected_parts),
        total_chars=len(full_text),
        menu_url=menu_url,
        menu_text_chars=len(menu_text or ""),
        asset=bool(asset_bytes),
    )
    return FetchResult(
        text=full_text,
        menu_url=menu_url,
        menu_text=menu_text,
        asset_bytes=asset_bytes,
        asset_mime=asset_mime,
    )
