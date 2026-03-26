# Product Brief: Asterley Bros AI Lead Generation & Outreach

## Overview
An automated system that identifies, qualifies, and contacts potential
stockists and venue partners for Asterley Bros craft spirits (English
Vermouth, Amaro, and Aperitivo) across London.

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
- **Google Maps Scraper**: Finds 60 qualified venues per week from targeted
  search queries (cocktail bars, wine bars, restaurants, hotels, bottle shops)
- **Instagram Scraper**: Discovers 40 relevant profiles per week via hashtag
  exploration and engagement analysis

### 2. Intelligent Lead Scoring
- Rule-based scoring engine with configurable weights
- Factors: website presence, contact info, ratings, cocktail focus,
  independence, location, social activity
- Minimum threshold filtering to focus on high-potential leads

### 3. AI-Powered Outreach Drafting
- Gemini 2.0 Flash generates personalised email and DM drafts
- Templates tailored to venue type and scoring signals
- Each draft references specific details about the venue

### 4. Human-in-the-Loop Approval
- Streamlit dashboard for reviewing all drafted messages
- Approve, reject, or regenerate each message
- No message is ever sent without explicit human approval

### 5. Multi-Channel Sending
- **Email**: Via Resend API with rate limiting and deliverability tracking
- **Instagram DMs**: Via Claude computer-use agent with natural interaction
  patterns

### 6. Pipeline Tracking & Follow-ups
- Visual pipeline showing lead progression through stages
- Automated follow-up scheduling (Day 5 and Day 12)
- Response tracking and conversion metrics

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
