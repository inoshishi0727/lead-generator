# Technical Brief: Asterley Bros AI Lead Generation System

## Architecture Overview
Python-based pipeline with Supabase (Postgres) persistence, stealth browser
automation via Camoufox, AI generation via Gemini Flash, and a Streamlit
dashboard for human oversight.

## System Components

### 1. Scrapers (`src/scrapers/`)

#### Google Maps Scraper
- **Browser**: Camoufox (Firefox-based anti-detect) + Playwright async API
- **Strategy**: Two-pass — scroll feed to collect cards, then click into each
  listing for detail extraction
- **Selectors**: Stable `data-item-id` and `role`/`aria-label` attributes
- **Rate limiting**: Configurable RPM with tenacity retry logic
- **Email extraction**: Secondary scrape of venue website contact pages
- **Locale**: Force `?hl=en` on all URLs

#### Instagram Scraper
- **Browser**: Camoufox + Playwright via Claude computer-use agent
- **Strategy**: Navigate hashtag pages, extract profile data from posts
- **Authentication**: Session-based login with credential management
- **Anti-detection**: Random delays, human-like scroll patterns

### 2. Database (`src/db/`)

#### Schema (Supabase/Postgres)
- `leads` — master lead table with all scraped fields + scoring
- `outreach_messages` — drafted/sent messages linked to leads
- `scrape_runs` — audit trail of scraper executions
- `activity_log` — all system events for debugging

#### Client
- Supabase Python SDK with connection pooling
- Pydantic models for type-safe data access

### 3. Scoring Engine (`src/scoring/`)
- Individual rule functions return (score, reason) tuples
- Configurable weights loaded from `config.yaml`
- Composite score normalized to 0–100
- Rules: website presence, email availability, rating threshold,
  review volume, cocktail keywords, venue independence, geography,
  Instagram activity

### 4. Outreach Generation (`src/outreach/`)

#### Draft Generation
- Gemini 2.0 Flash via `google-genai` SDK
- Template-based prompts with venue-specific context injection
- Separate templates for email vs. Instagram DM
- Temperature 0.7 for creative but professional tone

#### Email Sending
- Resend API with batch processing
- Rate limiting: 50/day, 10/batch, 30s between sends
- Delivery status tracking via webhooks

#### Instagram DM Sending
- Claude computer-use agent controls Camoufox browser
- Natural typing patterns and interaction timing
- Session management to avoid re-authentication

### 5. Pipeline Tracker (`src/pipeline/`)
- Stage progression: scraped → scored → draft_generated → approved →
  sent → follow_up_1 → follow_up_2 → responded → converted/declined
- Automated follow-up scheduling with configurable day offsets
- Stage transition validation (no skipping steps)

### 6. Dashboard (`src/dashboard/`)
- **Framework**: Streamlit with multi-page layout
- **Pages**:
  1. Leads — browse/filter/search all discovered leads
  2. Scoring — view score breakdowns, adjust weights
  3. Outreach — approve/reject/regenerate message drafts
  4. Pipeline — visual funnel, stage management
  5. Settings — configuration, API keys, run controls

### 7. Scheduling
- GitHub Actions cron workflows for weekly scrape runs
- Manual trigger option via workflow_dispatch

## Dependencies
```
camoufox[geoip] >= 0.4
playwright >= 1.40
supabase >= 2.0
google-genai >= 1.0
anthropic >= 0.40
resend >= 2.0
streamlit >= 1.30
pydantic >= 2.0
pydantic-settings >= 2.0
tenacity >= 8.0
structlog >= 24.0
pyyaml >= 6.0
pytest >= 8.0
pytest-asyncio >= 0.23
```

## Security Considerations
- All secrets in `.env`, never committed
- Supabase RLS policies for data access
- Rate limiting to avoid IP bans
- Camoufox fingerprint rotation
- Human approval gate before any external communication

## Error Handling
- Tenacity retry with exponential backoff for all external calls
- Structured logging via structlog for debugging
- Failed scrapes logged to `scrape_runs` with error details
- Dashboard shows error states for failed operations
