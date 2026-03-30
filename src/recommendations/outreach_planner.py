"""Smart outreach planner — recommends WHO to contact THIS WEEK and WHY.

Uses: seasonal calendar, venue categories, enrichment data, send-day rules,
and the brand system prompt to prioritize leads for outreach.
"""

from __future__ import annotations

from datetime import datetime

import structlog

log = structlog.get_logger()

# Seasonal calendar from brand system prompt
SEASONS = {
    "spring_summer": {"months": [3, 4, 5, 6], "products": ["ASTERLEY ORIGINAL", "SCHOFIELD'S", "ROSÉ", "DISPENSE"], "hook": "Spring/Summer menus", "serves": "Spritzes, White Negronis, highballs"},
    "high_summer": {"months": [7, 8], "products": ["ASTERLEY ORIGINAL", "ROSÉ", "RED"], "hook": "terrace season", "serves": "Spritzes, long drinks, pre-batched Negronis"},
    "autumn_winter": {"months": [9, 10, 11, 12, 2], "products": ["ESTATE", "DISPENSE", "BRITANNICA", "ASTERLEY ORIGINAL"], "hook": "Autumn/Winter menus", "serves": "Negronis, Manhattans, digestivos"},
    "january": {"months": [1], "products": ["SCHOFIELD'S", "ESTATE", "DISPENSE"], "hook": "Dry January / low ABV", "serves": "Reverse Martini, Americano, low ABV Spritzes"},
}

# Best send days (0=Mon, 6=Sun)
BEST_DAYS = {1, 2, 3}  # Tue, Wed, Thu

# Category priority by season (higher = contact first)
SEASONAL_CATEGORY_PRIORITY = {
    "spring_summer": {
        "cocktail_bar": 10, "wine_bar": 9, "hotel_bar": 8, "italian_restaurant": 8,
        "bottle_shop": 7, "gastropub": 6, "restaurant_groups": 5,
    },
    "high_summer": {
        "gastropub": 10, "hotel_bar": 9, "festival_operators": 9,
        "cocktail_bar": 8, "wine_bar": 7, "events_catering": 7,
    },
    "autumn_winter": {
        "cocktail_bar": 10, "hotel_bar": 9, "italian_restaurant": 9,
        "wine_bar": 8, "restaurant_groups": 7, "membership_clubs": 6,
    },
    "january": {
        "wine_bar": 10, "cocktail_bar": 9, "hotel_bar": 8,
        "gastropub": 7, "bottle_shop": 6,
    },
}


def get_current_season() -> str:
    month = datetime.now().month
    for season, cfg in SEASONS.items():
        if month in cfg["months"]:
            return season
    return "spring_summer"


def get_send_window() -> dict:
    """Return the next best send window."""
    now = datetime.now()
    weekday = now.weekday()

    if weekday in BEST_DAYS and 10 <= now.hour < 13:
        return {"status": "now", "label": "Right now — it's a send window", "day": now.strftime("%A"), "time": "10am-1pm"}

    # Find next best day
    days_ahead = 0
    for i in range(1, 8):
        candidate = (weekday + i) % 7
        if candidate in BEST_DAYS:
            days_ahead = i
            break

    from datetime import timedelta
    next_day = now + timedelta(days=days_ahead)
    return {
        "status": "upcoming",
        "label": f"{next_day.strftime('%A')} 10am-1pm",
        "day": next_day.strftime("%A"),
        "time": "10am-1pm",
    }


WEEKLY_TARGET = 100


def get_weekly_stats(leads: list[dict]) -> dict:
    """Count leads scraped this week and what categories are missing."""
    now = datetime.now()
    # Monday of this week
    monday = now - __import__("datetime").timedelta(days=now.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)

    this_week = []
    for lead in leads:
        # Only count leads with a contact method (email or IG) + enrichment
        if not lead.get("email") and not lead.get("instagram_handle"):
            continue
        enrichment = lead.get("enrichment") or {}
        if enrichment.get("enrichment_status") != "success":
            continue

        scraped_at = lead.get("scraped_at")
        if not scraped_at:
            continue
        if isinstance(scraped_at, str):
            try:
                dt = datetime.fromisoformat(scraped_at.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                continue
        elif isinstance(scraped_at, datetime):
            dt = scraped_at.replace(tzinfo=None) if scraped_at.tzinfo else scraped_at
        else:
            continue
        if dt >= monday:
            this_week.append(lead)

    # Count by category
    cat_counts: dict[str, int] = {}
    for lead in this_week:
        enrichment = lead.get("enrichment") or {}
        cat = enrichment.get("venue_category", "other") or "other"
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    return {
        "total": len(this_week),
        "remaining": max(0, WEEKLY_TARGET - len(this_week)),
        "by_category": cat_counts,
    }


def recommend_scrapes(weekly_stats: dict, season: str) -> list[dict]:
    """Recommend what to scrape to fill the weekly 100 target."""
    remaining = weekly_stats["remaining"]
    if remaining <= 0:
        return []

    category_priority = SEASONAL_CATEGORY_PRIORITY.get(season, {})
    current_cats = weekly_stats["by_category"]

    # What categories are underrepresented vs seasonal priority?
    recs = []
    for cat, priority in sorted(category_priority.items(), key=lambda x: -x[1]):
        current = current_cats.get(cat, 0)
        # Higher priority categories should have more leads
        target_pct = priority / sum(category_priority.values())
        target_count = max(5, int(WEEKLY_TARGET * target_pct))
        gap = target_count - current

        if gap > 0:
            # Map category to search queries
            from src.pipeline.query_suggester import CATEGORY_QUERIES
            queries = CATEGORY_QUERIES.get(cat, [f"{cat.replace('_', ' ')} London"])
            recs.append({
                "category": cat,
                "priority": priority,
                "current": current,
                "target": target_count,
                "gap": gap,
                "suggested_leads": min(gap, remaining),
                "queries": queries[:2],
                "reason": f"{cat.replace('_', ' ').title()} is high-priority for {SEASONS[season]['hook']} — only {current} scraped this week, need ~{target_count}",
            })

    # Sort by gap * priority
    recs.sort(key=lambda r: r["gap"] * r["priority"], reverse=True)

    # Distribute remaining across recommendations
    allocated = 0
    for rec in recs:
        if allocated >= remaining:
            rec["suggested_leads"] = 0
            continue
        alloc = min(rec["gap"], remaining - allocated)
        rec["suggested_leads"] = alloc
        allocated += alloc

    return [r for r in recs if r["suggested_leads"] > 0]


def _generate_ai_summary(
    season: str,
    season_cfg: dict,
    scored_leads: list[dict],
    category_counts: dict[str, int],
) -> str | None:
    """Generate a 2-3 sentence weekly focus briefing via Claude."""
    import os

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or not scored_leads:
        return None

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)

        cat_breakdown = ", ".join(
            f"{cat.replace('_', ' ')}: {count}"
            for cat, count in sorted(category_counts.items(), key=lambda x: -x[1])
        )
        top_summary = "; ".join(
            f"{l['business_name']} ({l['venue_category'].replace('_', ' ')}"
            f"{', ' + l['menu_fit'] + ' fit' if l['menu_fit'] != 'unknown' else ''})"
            for l in scored_leads[:5]
        )

        prompt = f"""You are the sales strategist for Asterley Bros (English Vermouth, Amaro & Aperitivo, SE London).

Season: {season.replace('_', ' ')}
Seasonal hook: {season_cfg['hook']}
Seasonal products: {', '.join(season_cfg['products'])}
Best serves right now: {season_cfg['serves']}
Total active leads: {len(scored_leads)}
With email: {sum(1 for l in scored_leads if l.get('email'))}
Category breakdown: {cat_breakdown}
Top leads this week: {top_summary}

Write a 2-3 sentence weekly outreach briefing for Rob (founder). Be specific:
- Which venue category to prioritise this week and why (tie to season/timing)
- Which product to lead with
- One tactical tip based on the actual lead mix

Keep it punchy and actionable. No fluff. Write as a strategist briefing, not marketing copy."""

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text
    except Exception as exc:
        log.warning("ai_summary_failed", error=str(exc))
        return None


def plan_outreach(leads: list[dict], limit: int = 10) -> dict:
    """Generate a smart outreach plan for this week.

    Returns prioritized leads with reasoning for each.
    """
    season = get_current_season()
    season_cfg = SEASONS[season]
    category_priority = SEASONAL_CATEGORY_PRIORITY.get(season, {})
    send_window = get_send_window()

    scored_leads = []
    category_counts: dict[str, int] = {}

    for lead in leads:
        stage = lead.get("stage", "")
        if stage in ("sent", "follow_up_1", "follow_up_2", "responded", "converted", "declined"):
            continue

        enrichment = lead.get("enrichment") or {}
        venue_cat = enrichment.get("venue_category") or lead.get("category") or "other"
        menu_fit = enrichment.get("menu_fit", "unknown")
        why_fits = enrichment.get("why_asterley_fits", "")
        lead_products = enrichment.get("lead_products", [])

        category_counts[venue_cat] = category_counts.get(venue_cat, 0) + 1

        priority = 0
        reasons = []

        # Boost leads that have email (ready to contact)
        if lead.get("email"):
            priority += 15

        # Seasonal category match
        cat_score = category_priority.get(venue_cat, 2)
        priority += cat_score * 3
        if cat_score >= 8:
            reasons.append(f"{venue_cat.replace('_', ' ').title()} is high-priority for {season_cfg['hook']}")

        # Menu fit
        if menu_fit == "strong":
            priority += 20
            reasons.append("Strong menu fit — they already serve relevant drinks")
        elif menu_fit == "moderate":
            priority += 10
            reasons.append("Moderate menu fit")

        # Has enrichment data (we know about them)
        if enrichment.get("enrichment_status") == "success":
            priority += 10
            if why_fits:
                reasons.append(why_fits)

        # Product overlap with season
        seasonal_products = set(season_cfg["products"])
        lead_product_set = set(lead_products)
        overlap = seasonal_products & lead_product_set
        if overlap:
            priority += len(overlap) * 5
            reasons.append(f"Seasonal match: {', '.join(overlap)}")

        # Score from scoring engine
        score = lead.get("score")
        if score and score > 60:
            priority += 15
        elif score and score > 40:
            priority += 8

        # Has contact name (personalized outreach)
        contact = enrichment.get("contact") or {}
        if contact.get("name"):
            priority += 5
            reasons.append(f"Direct contact: {contact['name']}")

        scored_leads.append({
            "lead_id": lead.get("id", ""),
            "business_name": lead.get("business_name", ""),
            "venue_category": venue_cat,
            "email": lead.get("email") or None,
            "priority": priority,
            "reasons": reasons[:3],
            "lead_products": list(overlap) if overlap else lead_products[:2],
            "seasonal_hook": season_cfg["hook"],
            "suggested_serves": season_cfg["serves"],
            "contact_name": contact.get("name") or lead.get("contact_name"),
            "menu_fit": menu_fit,
            "score": score,
        })

    # Sort by priority descending
    scored_leads.sort(key=lambda x: x["priority"], reverse=True)
    top_leads = scored_leads[:limit]

    # AI weekly focus summary
    ai_summary = _generate_ai_summary(season, season_cfg, scored_leads, category_counts)

    # Weekly progress
    weekly = get_weekly_stats(leads)

    return {
        "season": season,
        "seasonal_hook": season_cfg["hook"],
        "seasonal_products": season_cfg["products"],
        "seasonal_serves": season_cfg["serves"],
        "send_window": send_window,
        "ai_summary": ai_summary,
        "total_eligible": len(scored_leads),
        "recommended": top_leads,
        "weekly_target": WEEKLY_TARGET,
        "weekly_progress": weekly,
        "generated_at": datetime.now().isoformat(),
    }
