# Re-Enrich All Leads Script

Run this from the project root to re-enrich all existing leads and capture `menu_url` for each one.
Writes directly to production Firestore (`asterley-bros-b29c0`).

## Prerequisites

- Must be on `main` with the menu scraping PR merged
- `.env` must point to production Firestore (`asterley-bros-b29c0`)
- No VPS needed — runs directly from your laptop (proxy is optional)

## Step 1 — Authenticate with Google

If you haven't already (or credentials have expired):

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project asterley-bros-b29c0
```

## Step 2 — Run in a persistent session

Use `screen` so the script survives terminal disconnects or crashes:

```bash
screen -S re-enrich
```

Detach with `Ctrl+A, D`. Re-attach later with `screen -r re-enrich`.

> **Resuming after a crash?** The script below skips leads that already have `enrichment` + `enriched_at` set, so it's safe to re-run at any time without re-processing completed leads.

## Step 3 — Re-enrich script

Runs without the proxy — fetches websites directly from your laptop. Most sites work fine; a small number may block the request and those leads will get `enrichment_status: failed` (can be re-tried later).

The `PROXY_HOST=` and `PROXY_PORT=` prefixes explicitly clear those vars so they override whatever is set in `.env`, preventing the proxy from being used.

**This version skips leads already enriched** — safe to re-run after a crash without re-processing completed leads.

```bash
cd /Users/kothings/Downloads/lead-generator && PROXY_HOST= PROXY_PORT= uv run python -c "
import asyncio
from dotenv import load_dotenv
load_dotenv('.env')
load_dotenv('.env.local')

from src.config.loader import load_config
from src.db.firestore import get_leads, update_lead
from src.db.models import Lead, LeadSource
from src.enrichment.engine import EnrichmentEngine
from datetime import datetime

async def main():
    config = load_config()
    engine = EnrichmentEngine(config=config)
    docs = get_leads()
    leads = []
    skipped = 0
    for doc in docs:
        try:
            # Skip leads already enriched (safe resume after crash)
            if doc.get('enrichment') and doc.get('enriched_at'):
                skipped += 1
                continue
            leads.append(Lead(
                id=doc.get('id'),
                source=LeadSource(doc['source']),
                business_name=doc['business_name'],
                website=doc.get('website'),
            ))
        except Exception:
            continue
    print(f'Skipping {skipped} already-enriched leads. Re-enriching {len(leads)} remaining...')
    enriched = await engine.enrich_leads(leads)
    for lead in enriched:
        if lead.enrichment:
            update_lead(str(lead.id), {
                'enrichment': lead.enrichment.model_dump(mode='json'),
                'enriched_at': datetime.now().isoformat(),
            })
    print('Done.')

asyncio.run(main())
"
```

## Step 4 — Regenerate existing drafts

Once the script prints `Done.`, go to the **Outreach tab** in the dashboard and click **Regenerate All Drafts**.

This rebuilds all existing drafts with the new menu links attached to each card.

---

## Notes

- All **new** leads scraped after the PR was merged will automatically have `menu_url` populated — no manual step needed.
- Re-enriching overwrites the `enrichment` object for every lead. Scores and stage are unaffected.
- If you have VPS access and want to use the residential proxy (better success rate), prefix the command with `PROXY_HOST=go.resiprox.com PROXY_PORT=5000`.
- This script only updates enrichment data. It does **not** trigger draft generation — that's the separate Regenerate All Drafts step above.
