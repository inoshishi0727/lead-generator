"""Live progress reporter for scrape runs.

POSTs phase + progress + current_lead snapshots to the Firebase Cloud Function
endpoint configured via SCRAPE_PROGRESS_URL + SCRAPE_PROGRESS_TOKEN. Throttled
to one post per 15s during a run; a final post is forced when phase == 'done'.
Failures are logged and swallowed — telemetry must never crash a scrape.
"""

import os
import time
import requests
import structlog

log = structlog.get_logger()


class ProgressReporter:
    def __init__(self, run_id: str, min_interval_secs: float = 15.0):
        self.run_id = run_id
        self.url = os.getenv("SCRAPE_PROGRESS_URL")
        self.token = os.getenv("SCRAPE_PROGRESS_TOKEN")
        self.min_interval = min_interval_secs
        self._last_post = 0.0

    def report(
        self,
        *,
        phase: str | None = None,
        progress: int | None = None,  # 0..100
        current_query: str | None = None,
        current_lead: str | None = None,
        leads_found: int | None = None,
        force: bool = False,
    ) -> None:
        if not self.url or not self.token:
            return
        now = time.time()
        is_terminal = phase == "done"
        if not (force or is_terminal) and now - self._last_post < self.min_interval:
            return
        payload = {"run_id": self.run_id}
        if phase is not None:
            payload["phase"] = phase
        if progress is not None:
            payload["progress_pct"] = max(0, min(100, int(progress)))
        if current_query is not None:
            payload["current_query"] = current_query
        if current_lead is not None:
            payload["current_lead"] = current_lead
        if leads_found is not None:
            payload["leads_found"] = leads_found
        try:
            r = requests.post(
                self.url,
                json=payload,
                headers={"Authorization": f"Bearer {self.token}"},
                timeout=5,
            )
            r.raise_for_status()
            self._last_post = now
        except Exception as e:
            log.warning("scrape_telemetry_failed", run_id=self.run_id, error=str(e))
