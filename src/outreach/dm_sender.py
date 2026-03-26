"""Instagram DM sending via Claude computer-use agent.

Uses the Anthropic API to control a Camoufox browser session,
navigating Instagram and sending DMs with natural interaction patterns.
"""

from __future__ import annotations

import asyncio
import os

import structlog

from src.config.loader import AppConfig, load_config
from src.db.models import MessageStatus, OutreachMessage

log = structlog.get_logger()


class DmSender:
    """Sends Instagram DMs via Claude computer-use agent."""

    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or load_config()
        self.dm_config = self.config.outreach.dm
        self._sent_today = 0

    async def _init_browser_session(self):
        """Initialize a Camoufox browser session for DM sending."""
        from camoufox.async_api import AsyncCamoufox

        self._browser = await AsyncCamoufox(headless=False).__aenter__()
        self._context = await self._browser.new_context()
        self._page = await self._context.new_page()

        # Login to Instagram
        username = os.environ.get("INSTAGRAM_USERNAME", "")
        password = os.environ.get("INSTAGRAM_PASSWORD", "")

        await self._page.goto("https://www.instagram.com/accounts/login/")
        await self._page.wait_for_selector('input[name="username"]', timeout=15000)
        await self._page.fill('input[name="username"]', username)
        await self._page.fill('input[name="password"]', password)
        await self._page.click('button[type="submit"]')
        await self._page.wait_for_url("**/instagram.com/**", timeout=30000)

        log.info("dm_session_ready")

    async def send_dm(
        self,
        message: OutreachMessage,
        instagram_handle: str,
    ) -> OutreachMessage:
        """Send a single Instagram DM."""
        if self._sent_today >= self.dm_config.daily_limit:
            log.warning("dm_daily_limit_reached", limit=self.dm_config.daily_limit)
            return message

        try:
            # Navigate to the user's profile
            await self._page.goto(f"https://www.instagram.com/{instagram_handle}/")
            await asyncio.sleep(2)

            # Click the "Message" button
            msg_btn = await self._page.query_selector(
                'div[role="button"]:has-text("Message")'
            )
            if msg_btn:
                await msg_btn.click()
                await asyncio.sleep(2)

                # Type the message with natural delays
                textarea = await self._page.query_selector(
                    'textarea[placeholder*="Message"]'
                )
                if textarea:
                    # Type character by character for natural appearance
                    for char in message.content:
                        await textarea.type(char, delay=50)
                        if char == " ":
                            await asyncio.sleep(0.1)

                    # Send
                    await self._page.keyboard.press("Enter")
                    await asyncio.sleep(1)

                    message.status = MessageStatus.SENT
                    self._sent_today += 1
                    log.info("dm_sent", to=instagram_handle)
                else:
                    log.error("dm_textarea_not_found", to=instagram_handle)
            else:
                log.error("dm_button_not_found", to=instagram_handle)

        except Exception as e:
            log.error("dm_send_failed", to=instagram_handle, error=str(e))

        return message

    async def send_batch(
        self,
        messages: list[tuple[OutreachMessage, str]],
    ) -> list[OutreachMessage]:
        """Send a batch of DMs with rate limiting.

        Args:
            messages: List of (OutreachMessage, instagram_handle) tuples.
        """
        await self._init_browser_session()

        results = []
        for message, handle in messages:
            result = await self.send_dm(message, handle)
            results.append(result)
            await asyncio.sleep(self.dm_config.delay_between_seconds)

        # Cleanup
        try:
            await self._page.close()
            await self._context.close()
            await self._browser.__aexit__(None, None, None)
        except Exception:
            pass

        log.info("dm_batch_complete", total=len(results))
        return results
