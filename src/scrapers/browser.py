"""Shared browser launch with Camoufox -> CloakBrowser fallback."""

from __future__ import annotations

import os
from typing import Any

import structlog

log = structlog.get_logger()


def get_proxy_config() -> dict | None:
    """Build proxy config from environment variables."""
    host = os.environ.get("PROXY_HOST")
    port = os.environ.get("PROXY_PORT")
    if not host or not port:
        return None

    proxy = {"server": f"http://{host}:{port}"}
    username = os.environ.get("PROXY_USERNAME")
    password = os.environ.get("PROXY_PASSWORD")
    if username:
        proxy["username"] = username
    if password:
        proxy["password"] = password

    log.info("proxy_configured", host=host, port=port)
    return proxy


def get_sticky_proxy_config(session_id: str) -> dict | None:
    """Like get_proxy_config() but rewrites PROXY_USERNAME to request a sticky exit IP.

    Template is read from PROXY_STICKY_TEMPLATE (default: ``{base}-session-{sid}``).
    {base} is the original PROXY_USERNAME; {sid} is the supplied session_id.
    If the residential-proxy provider uses a different sticky format, set
    PROXY_STICKY_TEMPLATE accordingly — e.g. ``{base}-sessid-{sid}`` for
    Oxylabs-style, ``session-{sid}-{base}`` to prepend.
    """
    base = get_proxy_config()
    if not base:
        return None
    base_username = base.get("username", "")
    if not base_username:
        log.warning("sticky_proxy_no_base_username")
        return base
    template = os.environ.get("PROXY_STICKY_TEMPLATE", "{base}-session-{sid}")
    try:
        sticky_username = template.format(base=base_username, sid=session_id)
    except (KeyError, IndexError) as exc:
        log.warning("sticky_proxy_template_invalid", template=template, error=str(exc))
        return base
    base["username"] = sticky_username
    log.info(
        "proxy_sticky_session",
        host=base["server"],
        sticky_username_prefix=sticky_username.split("-")[0],
        session_id=session_id,
    )
    return base


async def launch_browser(
    headless: bool = False,
    proxy: dict | None = None,
) -> tuple[Any, str]:
    """Launch a stealth browser.

    Engine is chosen by the ``BROWSER_ENGINE`` env var:
      - ``cloakbrowser`` → use only CloakBrowser
      - ``camoufox``     → use only Camoufox
      - unset / anything else → try Camoufox first, fall back to CloakBrowser

    Playwright's Firefox driver requires proxy config at launch time — a
    context-level proxy dict is silently ignored, so proxy is passed here.

    Returns (browser_instance, engine_name).
    Browser windows are moved off-screen so they don't steal focus.
    """
    engine = (os.environ.get("BROWSER_ENGINE") or "").strip().lower()
    try_camoufox = engine in ("", "camoufox")
    try_cloak = engine in ("", "cloakbrowser")

    if try_camoufox:
        try:
            from camoufox.async_api import AsyncCamoufox
            camoufox_kwargs: dict = {
                "headless": headless,
                "locale": ["en-GB"],
                "firefox_user_prefs": {
                    "browser.tabs.loadDivertedInBackground": True,
                    "browser.tabs.loadInBackground": True,
                    "dom.disable_window_flip": True,
                    "intl.accept_languages": "en-GB,en",
                },
            }
            if proxy:
                # geoip=True is required alongside proxy — without it the
                # proxy config is partially ignored and routing can fail
                # with NS_ERROR_PROXY_CONNECTION_REFUSED.
                camoufox_kwargs["proxy"] = proxy
                camoufox_kwargs["geoip"] = True
            browser = await AsyncCamoufox(**camoufox_kwargs).__aenter__()
            await _move_offscreen(browser)
            log.info(
                "browser_launched",
                engine="camoufox",
                headless=headless,
                proxy_at_launch=bool(proxy),
            )
            return browser, "camoufox"
        except Exception as exc:
            log.warning("camoufox_launch_failed", error=str(exc))
            if not try_cloak:
                raise

    if try_cloak:
        from cloakbrowser import launch_async
        cloak_kwargs: dict = {"headless": headless}
        if proxy:
            cloak_kwargs["proxy"] = proxy
            cloak_kwargs["geoip"] = True
        browser = await launch_async(**cloak_kwargs)
        await _move_offscreen(browser)
        log.info(
            "browser_launched",
            engine="cloakbrowser",
            headless=headless,
            proxy_at_launch=bool(proxy),
        )
        return browser, "cloakbrowser"

    raise RuntimeError(
        f"BROWSER_ENGINE={engine!r} matches no known engine; use 'camoufox' or 'cloakbrowser'."
    )


async def _move_offscreen(browser: Any) -> None:
    """Move all browser windows off-screen to prevent focus stealing."""
    try:
        for context in browser.contexts:
            for page in context.pages:
                await move_page_offscreen(page)
    except Exception:
        pass


async def move_page_offscreen(page: Any) -> None:
    """Move a single page's window off-screen."""
    try:
        await page.evaluate("() => window.moveTo(-10000, -10000)")
    except Exception:
        pass


async def close_browser(browser: Any, engine: str) -> None:
    """Close browser based on engine type."""
    try:
        if engine == "camoufox":
            await browser.__aexit__(None, None, None)
        else:
            await browser.close()
        log.info("browser_closed", engine=engine)
    except Exception as exc:
        log.warning("browser_close_failed", engine=engine, error=str(exc))
