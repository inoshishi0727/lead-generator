# Product Brief: Asterley Bros AI Lead Generation & Outreach

## Overview
An automated system that identifies, qualifies, and contacts potential
stockists and venue partners for Asterley Bros craft spirits (English
Vermouth, Amaro, and Aperitivo) across the UK.

## Target Users
- **Rob Berry** (founder, super admin) — full visibility of all leads across
  all team members; assigns leads to team members; manages own lead pool;
  approves/rejects drafts for any lead
- **Team Members** (e.g. Alex) — manage their own assigned leads only; no
  visibility into other members' leads; can approve, edit, and send outreach
  for their own assigned leads
- The system operates autonomously for scraping/scoring, with human
  checkpoints before any external communication

## Problem Statement
Manual prospecting is time-consuming and inconsistent. As the team scales
beyond a single operator, geographic territories and lead pools must be
separated to avoid duplication and cross-contact. The admin needs unified
visibility while each team member works in isolation on their assigned
territory.

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
- Drafts are scoped to the assigned team member's leads only

### 4. Human-in-the-Loop Approval
- Next.js dashboard for reviewing all drafted messages
- Approve, reject, edit, or regenerate each message
- Edit feedback is stored and used to improve future drafts
- No message is ever sent without explicit human approval
- Team members only see and approve drafts for their own leads

### 5. Email Sending & Reply Tracking
- Outbound via Resend API with daily cap (150 emails)
- Plus-addressed reply-to for automatic inbound matching
- Reply threads visible in the dashboard alongside lead context

### 6. Pipeline Tracking & Follow-ups
- Visual pipeline showing lead progression through stages
- Automated follow-up scheduling (Day 5 and Day 12)
- Response tracking and conversion metrics
- Analytics dashboard with funnel, category breakdown, and trends

### 7. Multi-User Lead Assignment & Territories (NEW)
- Admin assigns leads to team members (individual or bulk)
- Unassigned leads remain in admin's pool
- Each team member sees only their own assigned leads
- Admin has full cross-team visibility with per-member filtering
- Geographic territory support via region-based bulk assignment
- Per-member outreach statistics on admin dashboard
- Firestore security rules enforce data isolation (not just UI)

## User Flows

### Flow 1: Admin Assigns Leads to a Team Member
1. Admin navigates to Leads page
2. Filters by region (e.g. location_city = "London")
3. Selects leads via checkbox
4. Clicks "Assign" and picks team member from dropdown
5. Selected leads gain `assigned_to` = member UID
6. Leads now appear in team member's dashboard, disappear from admin's
   unassigned pool

### Flow 2: Team Member Works Their Leads
1. Team member logs in — sees only their assigned leads
2. Generates drafts, reviews, edits, approves
3. Sends approved messages (within daily cap)
4. Handles replies in thread view
5. Cannot see or access any other member's leads

### Flow 3: Admin Reviews Cross-Team Activity
1. Admin opens dashboard — sees aggregate stats across all members
2. Filters by team member to see individual performance
3. Can reassign leads between members
4. Can take over a lead by reassigning to self
5. Full read/write access to any lead regardless of assignment

## Success Metrics
- 100 qualified leads discovered per week
- 70%+ approval rate on AI-generated drafts
- 15%+ response rate on outreach
- 5%+ conversion to meetings/tastings
- Zero cross-contact incidents (same venue contacted by two members)

## Constraints
- All scraping must respect rate limits and use stealth techniques
- Human approval required before any outreach is sent
- GDPR compliance for data handling
- Daily sending limits to protect sender reputation
- Team members must never see each other's lead data
- Lead assignment changes must be audit-logged
