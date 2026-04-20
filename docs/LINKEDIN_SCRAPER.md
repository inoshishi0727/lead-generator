# LinkedIn Employee Scraper — Runbook

## What it does

Given an existing lead in the `leads` collection, opens LinkedIn, finds that
company's profile, and extracts everyone listed on the `/people/` tab into the
`linkedin_employees` Firestore collection. Decision-makers (owner, director,
manager, buyer, bar manager, sommelier, etc.) are auto-flagged.

## How it's triggered

**CLI only — no dashboard integration.** This scraper is an independent
background process; it is not surfaced in the frontend. All invocations
happen via `python -m src.scrapers.linkedin` from the VPS (or any machine
with the repo + `GOOGLE_APPLICATION_CREDENTIALS` + `GEMINI_API_KEY`).

```
# Specific leads
uv run python -m src.scrapers.linkedin --lead-ids UUID,UUID,UUID

# Top-N highest-score leads missing LinkedIn data
uv run python -m src.scrapers.linkedin --auto-select-count 10

# Bulk backfill: every lead missing LinkedIn data (sorted by score desc)
uv run python -m src.scrapers.linkedin --all

# Bulk backfill with an elevated per-day cap (default is 30)
uv run python -m src.scrapers.linkedin --all --daily-cap 200

# Force-rescrape leads even if recently scraped (overrides rescrape_after_days=90)
uv run python -m src.scrapers.linkedin --all --rescrape-days 0

# Dry run (no Firestore writes)
uv run python -m src.scrapers.linkedin --lead-ids UUID --dry-run
```

Dormant VPS endpoint: `src/api/routes.py` also exposes `POST /api/linkedin-scrape`
and `GET /api/linkedin-scrape-status/{run_id}`. These are currently unused
(no frontend caller) but remain in place for future engineering — e.g. if
we re-introduce a dashboard trigger or schedule it via the VPS cron. A
module-level lock ensures only one LinkedIn scrape runs at a time per VPS.

## Proxy (sticky session)

LinkedIn invalidates a session if it sees it used from a different IP than
the one it was logged in from. With residential proxies the exit IP rotates
unless you request a sticky session.

The scraper handles this automatically:

1. On the first `--save-session`, it generates a random sticky session ID
   and persists it to `data/linkedin_proxy_sticky_id.txt`.
2. `PROXY_USERNAME` is rewritten to `{base}-session-{sid}` before every
   browser launch (both for save-session and every scrape).
3. The proxy provider returns the same exit IP for that session ID while it
   remains valid (typically 10–30 min per connection; longer across runs if
   the provider supports persistent sticky IPs).

### If your proxy provider uses a different sticky format

Set `PROXY_STICKY_TEMPLATE` in `.env` with `{base}` and `{sid}` placeholders.
Examples:

```
PROXY_STICKY_TEMPLATE={base}-session-{sid}      # default (resiprox, many others)
PROXY_STICKY_TEMPLATE={base}-sessid-{sid}       # Oxylabs-style
PROXY_STICKY_TEMPLATE=session-{sid}-{base}      # prepend variant
PROXY_STICKY_TEMPLATE={base}-session-{sid}-duration-30  # with session-lifetime
```

### Rotating the sticky IP

Delete `data/linkedin_proxy_sticky_id.txt`, then re-run `--save-session`.
A new session ID is generated and a new exit IP is assigned. The existing
LinkedIn session cookies will usually be invalidated by LinkedIn, so plan
for a fresh login.

### When the proxy is down

`--no-proxy` launches the browser without any proxy. The session then gets
tied to whatever IP you're on — every subsequent scrape must also use
`--no-proxy` from the same machine.

## One-time setup: save a LinkedIn session

No LinkedIn credentials are stored anywhere. Authentication is done once,
manually, and the resulting cookies/localStorage are persisted to
`data/linkedin_session.json`.

On the VPS:

```
cd /path/to/asterley-bros
uv run python -m src.scrapers.linkedin --save-session
```

A Camoufox browser window will open to LinkedIn's login page.

1. Log in normally (with your burner LinkedIn account, ideally Premium and
   aged 60+ days — never your personal account).
2. Clear any "remember this device" / 2FA challenges.
3. When you see the `/feed/` home page, return to the terminal and press
   `ENTER`.
4. The script dumps the session state to `data/linkedin_session.json` and
   closes the browser.

Future scraper runs load that file via Playwright's `storage_state` option
and skip the login page entirely.

## When the session expires

LinkedIn sessions live roughly 2–4 weeks for active browsing, less if you
trigger security checks. When expired, the scraper raises
`LinkedInSessionExpired` and API runs complete with
`status=failed, error="Session expired..."`. To refresh:

```
uv run python -m src.scrapers.linkedin --save-session
```

The old file is overwritten.

## Selectors

LinkedIn's DOM uses hashed, rotating class names. The stable selectors live in
`src/scrapers/selectors/linkedin_selectors.py`. Placeholders (`TODO_REPLACE`)
must be populated via live DOM inspection on these four pages (logged-in):

- `https://www.linkedin.com/search/results/companies/?keywords=<test>`
- `https://www.linkedin.com/company/<slug>/`
- `https://www.linkedin.com/company/<slug>/people/`

Prefer anchors in this order of stability:
1. URL patterns in hrefs (e.g. `a[href*='/in/']`)
2. `data-test-id`, `aria-label`
3. Structural paths (e.g. `li > div > a > span`)
4. Class names — **only if there's no alternative**, and update this file
   whenever they rotate

When a scrape returns 0 employees despite a valid session, the scraper writes
`data/debug_linkedin_{lead_id}_no_cards_initial.png`. Open that screenshot,
re-inspect the DOM, and update the selectors.

## Rate limits and safety caps

Configured in `config.yaml`:

| Setting | Default | Why |
|---|---|---|
| `rate_limits.linkedin_rpm` | 3 | LinkedIn rate-limits aggressively. Keep low. |
| `scraping.linkedin.max_employees_per_company` | 100 | Larger venues can have hundreds; cap to limit scroll volume. |
| `scraping.linkedin.max_companies_per_run` | 10 | Per `workflow_dispatch` / API call. |
| `scraping.linkedin.max_companies_per_day` | 30 | Hard cap across runs. Counts rows in `activity_log` where `event_type=linkedin_company_scraped` in the last 24h. |
| `scraping.linkedin.rescrape_after_days` | 90 | `--auto-select-count` skips leads scraped more recently than this. |

**Do not raise these without approval.** An account ban requires creating
and aging a new one, which takes weeks.

## CAPTCHAs and challenges

If LinkedIn shows a CAPTCHA iframe or challenge page (URL contains
`checkpoint/challenge`), the scraper raises `LinkedInBlocked` and exits.
Defaults: `abort_on_captcha: true`.

Recovery:
1. Do not attempt to re-run for at least 48 hours.
2. Log into the burner account manually in a normal browser, complete any
   security challenge LinkedIn shows, and dismiss device notifications.
3. Re-run `--save-session` to refresh.

Repeated challenges across multiple attempts = the account is under review.
Rotate to a new burner.

## Resuming a bulk backfill after a CAPTCHA

A `--all` run that hits a CAPTCHA halts cleanly: the lead being processed
gets `linkedin_scrape_status=rate_limited`, everything scraped before it
is already persisted, and the daily-cap counter reflects what completed.
After the 48h cooldown + session refresh:

```
uv run python -m src.scrapers.linkedin --all --daily-cap 20
```

The eligibility query skips leads that already have `linkedin_scraped_at`
set (success OR not_found). Rate-limited leads have no `linkedin_scraped_at`,
so they'll be retried. Full-rescrape of rate-limited-only leads is possible
via a future script; for now a second `--all` pass picks them up naturally.

## Data model

### `linkedin_employees` collection

Document ID: `{lead_id}_{profile_slug}` (deterministic for idempotent upsert).

Fields mirror `LinkedInEmployee` in `src/db/models.py`:

- `lead_id`, `company_linkedin_url`
- Identity: `name`, `profile_url`, `profile_slug`, `profile_image_url`
- Role: `title`, `role_seniority` (owner/director/manager/senior_staff/staff),
  `is_decision_maker` (bool)
- Context: `location`, `connection_degree`
- Meta: `confidence`, `scraped_at`, `last_seen_at`
- Outreach: `promoted_to_outreach`, `promoted_at`, `notes`

Re-scraping the same lead is idempotent: matching `(lead_id, profile_slug)`
updates `last_seen_at`; promotion flags are preserved.

### New `Lead` fields

- `linkedin_company_url` — set by auto-resolution or manually via the dialog
- `linkedin_scraped_at` — ISO timestamp of last completed scrape
- `linkedin_employee_count` — denormalized for the leads table
- `linkedin_scrape_status` — `success | not_found | failed | rate_limited | pending`

## Promoting an employee to outreach

Not currently wired up (no UI). Employees sit in `linkedin_employees` as
a research pool. When we're ready to act on the data, add a promotion flow
(either CLI or dashboard) that writes `contact_name` / `contact_role` /
`contact_confidence="linkedin_verified"` to the parent lead and sets
`promoted_to_outreach=true` + `promoted_at` on the employee record. The
lead then re-enters the existing outreach pipeline on the next
`generateDrafts` run. The scraper does not capture LinkedIn-provided
emails — email discovery remains a separate step.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `status=failed, error="Session expired..."` | Cookies stale | Re-run `--save-session` |
| `status=failed, error="LinkedIn blocked..."` | CAPTCHA / challenge | Wait 48h, manually clear in browser, re-save session |
| `status=not_found` | Company resolution missed, or `/people/` has no one visible | Paste correct URL into the lead dialog's **Company URL** field, re-scrape |
| 0 employees despite `status=success` | Selector drift | Update `linkedin_selectors.py` from fresh DOM; check `data/debug_linkedin_*.png` |
| HTTP 409 from `/api/linkedin-scrape` | A scrape is already running | Wait for the current run; check `/api/linkedin-scrape-status/{run_id}` |
| Daily cap reached | `max_companies_per_day` hit | Wait ~24h or raise the cap after confirming account health |

## Company resolution (Gemini-agentic)

When a lead has no `linkedin_company_url`, the scraper searches LinkedIn for
the business name, collects the top N results (default 5 — see
`scraping.linkedin.resolver_results_to_consider`), and asks Gemini to pick
the one that actually matches based on the lead's name + website + address
+ venue category. Gemini returns `{index, confidence, reason}`.

We accept the match if confidence ≥ `scraping.linkedin.resolver_min_confidence`
(default `medium`). Otherwise the lead is marked `not_found` and can be
fixed by editing `linkedin_company_url` in the lead dialog (escape hatch —
should rarely be needed).

The resolver reuses `scraping.enrichment.gemini_model` (default
`gemini-2.5-flash`) and the retry-wrapped `call_gemini_with_retry` helper
from `src/enrichment/analyzer.py`. No separate API key or client config.

Resolver decisions are logged in structured form — grep for
`linkedin_resolver_decision` in the output to audit matches:

```
linkedin_resolver_decision business="The Connaught Bar" chosen_index=1 \
  confidence=high reason="Name + London location + Mayfair hotel context match"
```

## Bulk backfill

To populate the `linkedin_employees` collection for every existing lead in
one session, use `--all`:

```
uv run python -m src.scrapers.linkedin --all --daily-cap 200
```

What it does:

- Pulls every lead where `linkedin_scraped_at` is null or older than
  `rescrape_after_days` (default 90).
- Orders by `score DESC` so if the run is interrupted, the highest-value
  leads are already done.
- Bypasses `max_companies_per_run` (default 10), but still respects
  `max_companies_per_day` unless overridden by `--daily-cap`.
- Emits a `linkedin_progress done=N/M pct=X employees_cum=Y` log line after
  every lead — greppable in `tail -f` for progress watching.
- **Resumable.** If interrupted (Ctrl-C, CAPTCHA abort, crash), re-running
  the same command skips leads that are already `success` or `not_found`.

Recommended recipe for a ~200–400 lead backfill:

```
# Dry run 5 leads to validate selectors + resolver on your data
uv run python -m src.scrapers.linkedin --all --dry-run --daily-cap 5

# First real pass: cautious, low cap, watch for CAPTCHAs
uv run python -m src.scrapers.linkedin --all --daily-cap 20

# If the cautious pass went clean, fill the rest over several days
uv run python -m src.scrapers.linkedin --all --daily-cap 50
```

At `rate_limits.linkedin_rpm: 3`, 50 companies/day is roughly 17 active
minutes of LinkedIn page loads — well under human browsing thresholds.

## Known limitations

- **No multi-VPS fan-out.** One VPS, one active scrape at a time.
- **No persistent run history.** Run status lives in an in-memory dict. If
  the VPS restarts mid-run, status is lost (employees already written to
  Firestore remain). Upgrade path: persist `linkedin_scrape_runs` to
  Firestore, parallel to the existing `scrape_runs` collection.
- **No CAPTCHA solver.** Intentional. Solving raises the ban risk.
- **No deep profile visits.** We only scrape the `/people/` listing card —
  not individual `/in/{slug}/` pages. Job history and contact info beyond
  what the card shows require a follow-on pass.
- **Email inference not included.** The scraper does not synthesize
  `first.last@domain.com`-style addresses. Treat employees as a research
  pool, then run existing email-discovery tools against each name.
