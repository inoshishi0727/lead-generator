"""Email sending via Resend API with rate limiting and batch processing."""

from __future__ import annotations

import asyncio
import html as html_mod
import os

import resend
import structlog

from src.config.loader import AppConfig, load_config
from src.db.models import MessageStatus, OutreachMessage

log = structlog.get_logger()

# HTML email signature — appended at send time, not stored in message content.
# Duplicated in frontend/src/app/api/outreach/send/route.ts and functions/index.js.
EMAIL_SIGNATURE_HTML = """\
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333;">
  <tr>
    <td style="padding-top: 12px; border-top: 1px solid #ddd;">
      <strong>Robert Berry</strong>&nbsp;&nbsp;|&nbsp;&nbsp;Co-founder<br>
      <a href="tel:+447817478196" style="color: #333; text-decoration: none;">+44 7817 478196</a><br>
      <a href="https://www.asterleybros.com" style="color: #b5651d; text-decoration: none;">www.asterleybros.com</a>
    </td>
  </tr>
  <tr>
    <td style="padding-top: 10px;">
      <img src="https://cdn.shopify.com/s/files/1/0447/7521/1172/files/Awards_Only_SML.png?v=1774997201"
           alt="Asterley Bros Awards" width="300" style="display: block;" />
    </td>
  </tr>
</table>"""


def _build_html_email(content: str) -> str:
    """Wrap plain-text message body in HTML and append the signature."""
    escaped = html_mod.escape(content)
    return (
        '<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;">'
        f'<div style="white-space: pre-wrap;">{escaped}</div>'
        "<br>"
        f"{EMAIL_SIGNATURE_HTML}"
        "</div>"
    )


class EmailSender:
    """Sends approved outreach emails via the Resend API."""

    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or load_config()
        self.email_config = self.config.outreach.email
        resend.api_key = os.environ["RESEND_API_KEY"]
        self._from_email = os.environ.get("RESEND_FROM_EMAIL", "rob@asterleybros.com")
        self._sent_today = 0

    def send_email(self, message: OutreachMessage, to_email: str) -> OutreachMessage:
        """Send a single email via Resend."""
        if self._sent_today >= self.email_config.daily_limit:
            log.warning("daily_limit_reached", limit=self.email_config.daily_limit)
            return message

        try:
            params = resend.Emails.SendParams(
                from_=self._from_email,
                to=[to_email],
                subject=message.subject or "Asterley Bros — Craft Spirits",
                text=message.content,
                html=_build_html_email(message.content),
            )
            result = resend.Emails.send(params)
            message.status = MessageStatus.SENT
            self._sent_today += 1
            log.info("email_sent", to=to_email, resend_id=result.get("id"))
        except Exception as e:
            message.status = MessageStatus.BOUNCED
            log.error("email_send_failed", to=to_email, error=str(e))

        return message

    async def send_batch(
        self,
        messages: list[tuple[OutreachMessage, str]],
    ) -> list[OutreachMessage]:
        """Send a batch of emails with rate limiting.

        Args:
            messages: List of (OutreachMessage, recipient_email) tuples.
        """
        results = []
        for i, (message, email) in enumerate(messages):
            if i > 0 and i % self.email_config.batch_size == 0:
                log.info("batch_pause", sent_so_far=i)
                await asyncio.sleep(self.email_config.delay_between_seconds)

            result = self.send_email(message, email)
            results.append(result)
            await asyncio.sleep(self.email_config.delay_between_seconds)

        log.info("batch_complete", total=len(results))
        return results
