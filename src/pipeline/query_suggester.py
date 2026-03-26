"""Map venue categories to recommended Google Maps search queries."""

from __future__ import annotations

CATEGORY_QUERIES: dict[str, list[str]] = {
    "cocktail_bar": [
        "cocktail bars London",
        "speakeasy London",
        "craft cocktail bar London",
    ],
    "wine_bar": [
        "wine bars London",
        "natural wine bar London",
        "wine and cheese bar London",
    ],
    "hotel_bar": [
        "boutique hotel bar London",
        "hotel cocktail bar London",
        "luxury hotel bar London",
    ],
    "italian_restaurant": [
        "Italian restaurant London",
        "aperitivo bar London",
        "Negroni bar London",
    ],
    "gastropub": [
        "gastropub London",
        "craft beer pub cocktails London",
        "elevated pub London",
    ],
    "bottle_shop": [
        "independent bottle shop London",
        "craft spirits shop London",
        "wine and spirits shop London",
    ],
    "restaurant_groups": [
        "restaurant group London",
        "multi-site bar group London",
    ],
    "other": [
        "deli and wine shop London",
        "farm shop London spirits",
        "events venue London bar",
        "members club London bar",
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
