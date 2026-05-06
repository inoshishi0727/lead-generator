# LinkedIn Scraper — Health Brief & Action Items

**Status as of 2026-05-06.** Code review only — live scrape metrics not yet retrieved (Firestore ADC reauth required to run `functions/linkedin-health-check.mjs`).

## Architecture

- **Code**: `src/scrapers/linkedin.py` (~1600 lines), selectors at `src/scrapers/selectors/linkedin_selectors.py`
- **Hosting**: Hetzner VPS, FastAPI app at `http://46.225.19.1:8000`
- **Trigger**: Frontend → `vpsApi.post("/api/linkedin-scrape", ...)` → `_run_linkedin_scrape` background thread
- **Auth**: Persistent CloakBrowser profile at `data/linkedin_browser_profile/` (cookies + localStorage + fingerprint). One-off login via `python -m src.scrapers.linkedin --save-session`
- **Extraction**: All-tab search for the business name, collect every profile card, then Gemini agentic filter to identify employees. Optional company-page scraper extracts socials/phone/email/industry/size and reads the People tab.
- **Output**: Firestore `linkedin_employees` collection, plus denormalized fields on `leads` (twitter_handle, facebook_url, linkedin_company_size, etc.)
- **Concurrency**: `_linkedin_lock` enforces one scrape at a time per VPS
- **Daily cap**: configurable in `config.yaml`
- **Rate limit**: `linkedin_rpm: 3` (`config.yaml:263`) — ~180 leads/hour ceiling

## Known Risk Areas (ranked by likely impact)

### 1. Selector drift — HIGH
LinkedIn DOM uses obfuscated, rotating class names. `linkedin_selectors.py` was authored as TODO placeholders — relies on structural anchors and href patterns, but every few weeks LinkedIn ships a layout change that empties the selector results. Failure mode is silent: the scraper completes but returns zero employees.

**Action**: add a "selectors look broken" alarm — if a run completes with `employees_found == 0` for a lead that previously had results, flag for manual selector audit.

### 2. Session expiry — MEDIUM
The persistent profile holds login state, but LinkedIn invalidates sessions periodically (especially after IP changes or detected automation). When that happens, `LinkedInSessionExpired` fires and every subsequent run fails until someone VNCs into the VPS and re-runs `--save-session`.

**Action**: alert on first `session_expired` failure (don't wait for the daily report). Also document the VNC + re-auth runbook.

### 3. Rate limit + single-run lock — MEDIUM
3 RPM means a 50-lead batch takes ~17 minutes minimum, and only one scrape can run at a time. Combined with the daily cap, large batches stall the pipeline.

**Action**: confirm whether 3 RPM is a deliberate anti-detection ceiling or a holdover. If we have the proxy budget, parallelize by spinning up a second worker on a separate residential IP.

### 4. Block detection — LOW (but catastrophic)
`LinkedInBlocked` exception exists in the catch list, suggesting it's hit at least occasionally. Unclear whether it triggers a cooldown or just fails the run.

**Action**: confirm cooldown logic. If we hit a block we should pause LinkedIn scrapes for 24h to avoid burning the account.

### 5. In-memory run history — LOW
`_linkedin_runs` is a Python dict in process memory. VPS restart wipes the run history, so the only persistent record is what the scraper itself writes to Firestore.

**Action**: add a Firestore-backed run log so we can answer "when did we last successfully scrape?" without SSH'ing the VPS.

## Recent commits (most recent first)

```
32c51ab  feat: add Google search fallback for social media when no LinkedIn company page exists
9cf9bab  fix: add VNC proxy auth note and clarify --no-proxy for VPS session save
519760f  feat: add LinkedIn company page agentic scraper with social media, phone, email extraction
c0f37a7  fix: persistent browser profile + robust Gemini fallback chain
03a69f0  feat: add LinkedIn employee scraper with All-tab + Gemini agentic filtering
```

No commits to the scraper since the company-page agentic work landed — no recent churn, but also no recent maintenance.

## Suggested Tasks for the Assignee

1. **Live health check** — run `gcloud auth application-default login` then `node functions/linkedin-health-check.mjs` from the repo root. Report:
   - leads with `linkedin_status = scraped` vs. `pending` / `blocked` / `session_expired`
   - last successful scrape timestamp
   - employees collected per day for the last 7 days
2. **VNC into the VPS** — confirm session is still valid, check the latest `data/debug_linkedin_*.png` screenshots for selector drift, tail the log for any silent failures.
3. **Firestore-backed run log** — extend `_run_linkedin_scrape` to write to a `pipeline_jobs` doc (matches the pattern used by `scheduledFollowups`) so we have a persistent audit trail.
4. **Empty-result alarm** — when a run completes with `employees_found == 0` for a lead with a known LinkedIn presence, log a warning to Firestore and surface in the daily report.
5. **Session-expiry alert** — first `session_expired` failure should trigger a Resend email to admins, not wait for the next daily report cycle.
6. **Selector audit pass** — `linkedin_selectors.py` was last touched alongside the company-page work. Worth a fresh inspection now to confirm the All-tab + People-tab selectors still match the live DOM.

## Helpful entry points

- `src/scrapers/linkedin.py:1` — module docstring with CLI usage
- `src/scrapers/selectors/linkedin_selectors.py` — selector constants (this is the file that breaks first)
- `src/api/routes.py:391` — `_run_linkedin_scrape` background worker
- `src/api/routes.py:448` — `/linkedin-scrape` POST endpoint
- `src/api/routes.py:485` — `/linkedin-scrape-status/{run_id}` poll endpoint
- `src/api/routes.py:496` — `/leads/{lead_id}/linkedin-employees` lookup
- `frontend/src/hooks/use-linkedin-employees.ts` — frontend reader
- `frontend/src/components/lead-detail-dialog.tsx:27` — UI surface
- `functions/linkedin-health-check.mjs` — one-shot Firestore health snapshot (newly added, not committed yet)

## Note on this branch

Pushed today on `feat/sommelier-conversations-tab` (commit `26cae29`):
- AI feedback loop for outreach drafts (subject/content feature extraction, segment-keyed stats aggregation, Gemini-powered draft coach panel, top-replier few-shot in `generateDrafts`)
- Added `alex@asterleybros.com` as an extra recipient on `scheduledDailyReport`
