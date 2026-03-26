# Asterley Bros — AI Lead Generation & Outreach System

## Project Overview
Automated weekly pipeline to scrape qualified leads (Google Maps + Instagram),
score them, generate personalised outreach via Gemini AI, and send approved
messages via Resend (email) and Claude computer-use agent (Instagram DMs).

## Tech Stack
- **Language**: Python 3.11
- **Package Manager**: uv
- **Database**: Supabase (Postgres)
- **Browser Automation**: Camoufox + Playwright
- **AI**: Gemini 2.0 Flash (drafts), Claude computer-use (Instagram DMs)
- **Email**: Resend API
- **Dashboard**: Streamlit
- **Logging**: structlog
- **Validation**: Pydantic + pydantic-settings

## Commands
- `uv run pytest` — run all tests
- `uv run streamlit run src/dashboard/app.py` — launch dashboard
- `uv run python -m src.scrapers.gmaps --dry-run` — test Google Maps scraper

## Project Structure
- `src/scrapers/` — Google Maps + Instagram scrapers
- `src/scoring/` — Lead scoring rules engine
- `src/outreach/` — Gemini drafts + email/DM sending
- `src/pipeline/` — Stage tracker + follow-ups
- `src/dashboard/` — Streamlit UI (5 pages)
- `src/db/` — Supabase client, models, migrations
- `src/config/` — YAML config loader
- `docs/specs/input/` — Product brief, technical brief, API spec
- `config.yaml` — Central configuration

## Conventions
- All code uses type hints
- Pydantic models for data validation
- structlog for all logging
- Async where beneficial (scrapers, API calls)
- Tests in `tests/` mirror `src/` structure
