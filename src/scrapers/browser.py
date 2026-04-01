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


async def launch_browser(headless: bool = False) -> tuple[Any, str]:
    """Launch a stealth browser. Tries Camoufox first, falls back to CloakBrowser.

    Returns (browser_instance, engine_name).
    """
    # Try Camoufox
    try:
        from camoufox.async_api import AsyncCamoufox
        browser = await AsyncCamoufox(headless=headless).__aenter__()
        log.info("browser_launched", engine="camoufox", headless=headless)
        return browser, "camoufox"
    except Exception as exc:
        log.warning("camoufox_launch_failed", error=str(exc))

    # Fallback to CloakBrowser
    from cloakbrowser import launch_async
    browser = await launch_async(headless=headless)
    log.info("browser_launched", engine="cloakbrowser", headless=headless)
    return browser, "cloakbrowser"


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
