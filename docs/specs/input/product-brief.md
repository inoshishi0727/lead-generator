# Product Brief: Asterley Bros AI Lead Generation & Outreach

## Overview
An automated system that identifies, qualifies, and contacts potential
stockists and venue partners for Asterley Bros craft spirits (English
Vermouth, Amaro, and Aperitivo) across the UK.

## Target Users
- **Rob & Jim Berry** (founders) — review and approve outreach before sending
- The system operates autonomously for scraping/scoring, with human
  checkpoints before any external communication

## Problem Statement
Manual prospecting is time-consuming and inconsistent. Rob and Jim spend
hours each week searching Google Maps and Instagram for potential venues,
then crafting individual messages. This system automates the research and
drafting while keeping humans in the loop for final approval.

## Key Features

### 1. Automated Lead Discovery
- **Google Maps Scraper**: Finds qualified venues per week from targeted
  search queries across 20+ venue categories (cocktail bars, wine bars,
  restaurants, hotels, bottle shops, etc.)
- **Instagram Scraper**: Discovers relevant profiles via hashtag exploration
  and engagement analysis

### 2. Intelligent Lead Scoring
- Rule-based scoring engine with configurable weights
- Factors: website presence, contact info, ratings, cocktail focus,
  independence, location, social activity
- Minimum threshold filtering to focus on high-potential leads

### 3. AI-Powered Outreach Drafting
- Claude Sonnet generates personalised email drafts using lead enrichment
  data and past human edit feedback as few-shot examples
- Gemini 2.5 Flash handles website enrichment and outreach strategy
- Each draft references specific details about the venue

### 4. Human-in-the-Loop Approval
- Next.js dashboard for reviewing all drafted messages
- Approve, reject, edit, or regenerate each message
- Edit feedback is stored and used to improve future drafts
- No message is ever sent without explicit human approval

### 5. Email Sending & Reply Tracking
- Outbound via Resend API with daily cap (150 emails)
- Plus-addressed reply-to for automatic inbound matching
- Reply threads visible in the dashboard alongside lead context

### 6. Pipeline Tracking & Follow-ups
- Visual pipeline showing lead progression through stages
- Automated follow-up scheduling (Day 5 and Day 12)
- Response tracking and conversion metrics
- Analytics dashboard with funnel, category breakdown, and trends

## Success Metrics
- 100 qualified leads discovered per week
- 70%+ approval rate on AI-generated drafts
- 15%+ response rate on outreach
- 5%+ conversion to meetings/tastings

## Constraints
- All scraping must respect rate limits and use stealth techniques
- Human approval required before any outreach is sent
- GDPR compliance for data handling
- Daily sending limits to protect sender reputation
