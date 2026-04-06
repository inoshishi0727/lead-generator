# Asterley Bros — Lead Generation Infrastructure Proposal

**Prepared for:** Asterley Bros
**Date:** 6 April 2026
**Status:** Pending Approval

---

## Executive Summary

We propose moving the automated lead scraping system to a dedicated cloud server (VPS). This replaces the current setup where scrapers run manually on a developer's machine, making lead generation fully automated, reliable, and hands-free.

The server runs on a weekly schedule, discovers new venue leads across multiple sources, enriches them with AI analysis, and delivers them directly to the existing Asterley Bros dashboard for review and outreach.

**Monthly cost: approximately EUR 12.49 (~GBP 11/mo).**

---

## What It Does

The server performs one job: **find and qualify new leads automatically.**

Every week (configurable), the system:

1. **Scrapes 6 sources simultaneously** for potential venue and B2B leads:
   - Google Maps (17 search queries covering all venue categories)
   - Google Search (6 queries for B2B categories not on Maps)
   - Bing Search (6 queries, same B2B categories — different results surface different leads)
   - Yell.com (UK business directory — 6 category pages)
   - Trustpilot (business reviews — food & beverage category)
   - Industry publications (The Spirits Business, Difford's Guide, Drinks International)

2. **Extracts contact information** from each venue's website (email, phone, address)

3. **Enriches leads with AI** (Gemini) — analyses the venue's website to determine:
   - Venue category (cocktail bar, wine bar, gastropub, etc.)
   - Menu fit with Asterley Bros products
   - Recommended products to pitch
   - Contact name and role (where available)
   - Suggested outreach tone

4. **Saves qualified leads** to the existing Asterley Bros dashboard, ready for review and email outreach

**No manual intervention required.** Leads appear in the dashboard automatically.

---

## Venue Categories Covered

| Category | Source | Queries |
|----------|--------|---------|
| Cocktail bars | Google Maps | "cocktail bars London" |
| Wine bars | Google Maps | "wine bars London" |
| Italian restaurants | Google Maps | "Italian restaurants London" |
| Gastropubs | Google Maps | "gastropubs London" |
| Hotel bars | Google Maps | "boutique hotels London bar" |
| Bottle shops | Google Maps | "independent bottle shops London" |
| Delis & farm shops | Google Maps | "deli and wine shop London", "farm shops London" |
| Luxury food retail | Google Maps | "luxury food shops London" |
| Independent grocery | Google Maps | "independent grocery shops London" |
| Events & catering | Google Maps | "events catering companies London" |
| Festival vendors | Google Maps | "festival food vendors London" |
| Restaurant groups | Google Maps | "restaurant groups London" |
| Private members clubs | Google Maps | "private members clubs London" |
| Cookery schools | Google Maps | "cookery schools London" |
| Corporate gifting | Google Maps | "corporate gift hampers London" |
| Subscription boxes | Google + Bing | "UK spirits subscription box companies" |
| Airlines & trains | Google + Bing | "airline beverage suppliers UK" |
| Yacht charters | Google + Bing | "yacht charter catering UK drinks" |
| Film/TV/Theatre | Google + Bing | "film TV production catering London drinks" |
| RTD brands | Google + Bing | "RTD ready to drink spirits brands UK" |

**20 categories, 36+ search queries, 6 data sources.**

---

## Infrastructure

### Server Specification

| Component | Detail |
|-----------|--------|
| Provider | Hetzner Cloud (Germany) |
| Plan | CPX31 |
| CPU | 4 vCPU (AMD EPYC) |
| RAM | 8 GB |
| Storage | 80 GB NVMe SSD |
| Location | Nuremberg, DE (EU IP) |
| OS | Ubuntu 24.04 LTS |

### Why This Server

- **8 GB RAM** is required because the system runs up to 10 browser instances simultaneously, each consuming approximately 500 MB–1 GB of memory
- **EU-based IP** ensures Google Maps returns UK/EU-relevant results
- **Hetzner** offers the best value for compute-heavy workloads — equivalent specifications on DigitalOcean or AWS would cost 3–5x more

### What Runs On It

- Automated browser instances (Camoufox) for scraping
- AI enrichment pipeline (calls Gemini API)
- Scheduled weekly cron job

### What Does NOT Run On It

- No website or web server (the dashboard and frontend remain on Netlify)
- No database (data is stored in Firebase/Firestore, unchanged)
- No email sending (handled by existing Firebase Cloud Functions)
- No public-facing services — the server only makes outbound connections

---

## Cost Breakdown

| Item | Monthly Cost | Annual Cost |
|------|-------------|-------------|
| Hetzner CPX31 (8 GB / 4 vCPU) | EUR 12.49 | EUR 149.88 |
| Residential proxy (existing) | Already included | — |
| Gemini API (enrichment) | ~EUR 2–5 (usage-based) | ~EUR 24–60 |
| **Total** | **~EUR 15–18/mo** | **~EUR 174–210/yr** |

Notes:
- Hetzner bills hourly — if the server is deleted, billing stops immediately
- No long-term contract or commitment required
- The server can be resized (up or down) at any time with a simple reboot
- Gemini API costs depend on lead volume; estimate based on ~200–400 leads enriched per week

---

## Schedule & Runtime

| Parameter | Value |
|-----------|-------|
| Frequency | Once per week (configurable) |
| Suggested schedule | Monday 06:00 UTC |
| Estimated runtime | 4–8 hours per full run |
| Server idle time | ~90% of the week |

The server is active only during the scraping window. It sits idle the remaining ~152 hours per week, consuming no additional resources.

---

## Data Flow

```
VPS (Hetzner)                    Firebase / Netlify (existing)
+-------------------+            +---------------------------+
|                   |            |                           |
|  Scraper runs     |  writes   |  Firestore database       |
|  weekly on cron   | --------> |  (leads collection)       |
|                   |            |                           |
|  Enrichment runs  |  writes   |  Dashboard (Netlify)      |
|  after scraping   | --------> |  shows new leads for      |
|                   |            |  review and approval      |
+-------------------+            |                           |
                                 |  Cloud Functions          |
                                 |  generate email drafts    |
                                 |  send approved emails     |
                                 +---------------------------+
```

**Nothing changes in the existing dashboard, email system, or approval workflow.** The VPS simply feeds new leads into the pipeline automatically.

---

## Security

- The server has **no open inbound ports** — it only makes outbound connections to Google, Bing, venue websites, Firestore, and the Gemini API
- Firestore access uses a **service account** with write-only permissions to the `leads` collection
- API keys and credentials are stored in an environment file with restricted file permissions (readable only by the service user)
- The server is updated automatically via Ubuntu's unattended-upgrades
- SSH access is key-based only (no password authentication)

---

## Deduplication

The system ensures **zero duplicate leads** across all sources:

- Before saving any lead, it checks the existing database by business name — regardless of which source found it
- A cocktail bar discovered on Google Maps will not be added again if Bing or Yell.com also returns it
- Deduplication runs both in-memory (during scraping) and at the database level (during save)

---

## Monitoring

- Each scrape run logs its status, lead count, and any errors to Firestore
- The dashboard can display last run status (date, leads found, errors)
- Optional: Discord/Slack webhook notification on failure

---

## Setup Timeline

| Step | Time |
|------|------|
| Provision Hetzner server | 5 minutes |
| Install dependencies and deploy code | 1 hour |
| Configure credentials and test run | 1 hour |
| Set up scheduled cron job | 15 minutes |
| **Total** | **~2.5 hours** |

---

## Approval

To proceed, we need:

1. **Approval of the monthly budget** (~EUR 15–18/mo)
2. **Confirmation of scraping schedule** (weekly on Monday mornings, or alternative)
3. **Confirmation of venue categories** — are the 20 categories listed above correct, or should any be added/removed?

Once approved, the server can be live and running its first automated scrape within the same day.

---

*Prepared by the Asterley Bros engineering team.*
