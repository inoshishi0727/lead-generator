"""Google Maps selectors — updated 2026-03-23.

Strategy: Prefer role, aria-label, and data-item-id attributes for stability.
Google Maps dropped role='feed' from the results container; results are now
div[role='article'] items inside a scrollable div.
"""

# Results list — individual result items have role="article"
RESULT_ITEM = "div[role='article']"
LISTING_CARDS = "a[href*='/maps/place/']"

# Scroll container — the scrollable parent that holds the result items.
# We locate it at runtime via JS (find the nearest scrollable ancestor of
# the first role="article" element).
SCROLL_CONTAINER_JS = """() => {
    const item = document.querySelector('div[role="article"]');
    if (!item) return false;
    let el = item.parentElement;
    while (el) {
        if (el.scrollHeight > el.clientHeight) return true;
        el = el.parentElement;
    }
    return false;
}"""

SCROLL_FEED_JS = """() => {
    const item = document.querySelector('div[role="article"]');
    if (!item) return;
    let el = item.parentElement;
    while (el) {
        if (el.scrollHeight > el.clientHeight) {
            el.scrollTop = el.scrollHeight;
            return;
        }
        el = el.parentElement;
    }
}"""

# Card-level data (extracted from the feed without clicking)
CARD_BUSINESS_NAME_ATTR = "aria-label"  # on the <a> element

# Detail panel selectors (after clicking into a listing)
DETAIL_SELECTORS = {
    "name": "h1.DUwDvf",
    "address": "button[data-item-id='address']",
    "phone": "button[data-item-id^='phone:']",
    "website": "a[data-item-id='authority']",
    "hours": "button[data-item-id='oh']",
    "rating": "span[role='img'][aria-label*='star']",
    "category": "button[jsaction*='category']",
}

# Rating + review count (on card or detail panel)
RATING_IMG = "span[role='img'][aria-label*='star']"

# Navigation
BACK_BUTTON = "button[aria-label='Back']"

# End-of-results detection
END_OF_LIST_TEXT = "You've reached the end of the list"
END_OF_LIST = "xpath=//*[contains(text(), \"You've reached the end of the list\")]"
