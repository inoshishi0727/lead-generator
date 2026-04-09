"""Map venue categories to recommended Google Maps search queries."""

from __future__ import annotations

CATEGORY_QUERIES: dict[str, list[str]] = {
    "cocktail_bar": [
        "cocktail bars UK",
        "speakeasy UK",
        "craft cocktail bar UK",
    ],
    "wine_bar": [
        "wine bars UK",
        "natural wine bar UK",
        "wine and cheese bar UK",
    ],
    "hotel_bar": [
        "boutique hotel bar UK",
        "hotel cocktail bar UK",
        "luxury hotel bar UK",
    ],
    "italian_restaurant": [
        "Italian restaurant UK",
        "aperitivo bar UK",
        "Negroni bar UK",
    ],
    "gastropub": [
        "gastropub UK",
        "craft beer pub cocktails UK",
        "elevated pub UK",
    ],
    "bottle_shop": [
        "independent bottle shop UK",
        "craft spirits shop UK",
        "wine and spirits shop UK",
    ],
    "restaurant_groups": [
        "restaurant group UK",
        "multi-site bar group UK",
    ],
    "other": [
        "deli and wine shop UK",
        "farm shop UK spirits",
        "events venue UK bar",
        "members club UK bar",
    ],
}


def suggest_queries(
    deficit_categories: list[dict],
    existing_queries: list[str],
) -> list[dict]:
    """Return prioritized search queries for underrepresented categories.

    Args:
        deficit_categories: Output from PipelineTracker.get_deficit_categories(),
            sorted by largest deficit first.
        existing_queries: Currently configured search queries to avoid duplicates.

    Returns:
        List of dicts with category, query, priority.
    """
    existing_lower = {q.lower() for q in existing_queries}
    suggestions = []

    for deficit in deficit_categories:
        cat = deficit["category"]
        delta = deficit["delta"]
        if delta <= 0:
            continue  # Already at or above target

        queries = CATEGORY_QUERIES.get(cat, [])
        priority = "high" if delta > 0.10 else "medium" if delta > 0.05 else "low"

        for query in queries:
            if query.lower() not in existing_lower:
                suggestions.append({
                    "category": cat,
                    "query": query,
                    "priority": priority,
                })

    return suggestions
