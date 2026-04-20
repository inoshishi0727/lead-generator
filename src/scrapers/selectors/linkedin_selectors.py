"""LinkedIn selectors.

LinkedIn's DOM is heavily obfuscated (ember-view, hashed class names that rotate).
Prefer stable anchors: data-test-id attributes, aria-label, URL href patterns
(e.g. `a[href*='/in/']`), and structural ancestry over class names.

These constants are deliberately left as TODO placeholders. Populate them by:
  1. `python -m src.scrapers.linkedin --save-session`  (one-time manual login)
  2. Navigate LinkedIn logged-in, open DevTools -> Elements, inspect each page
  3. Replace the TODO strings below with the actual selectors you find
  4. Re-run the scraper; if a selector misses, the scraper saves a debug
     screenshot to data/debug_linkedin_{lead_id}.png for re-inspection

Selector drift is expected — update this file whenever the scraper starts
returning empty employee lists despite a valid session.
"""

# --- Page 1: Company search (/search/results/companies/?keywords=...) ---
# Class names on the search results page rotate — we rely on structural anchors
# (`div[role='list']`, `div[data-display-contents='true']`) and href patterns.
# A "website" field is NOT rendered on search result cards (name / industry /
# location / followers only) — verify match on the company overview "About"
# page instead. Hence first_result_website is None.
COMPANY_SEARCH_SELECTORS: dict[str, str | None] = {
    # --- First-result-only (legacy, kept for debug) ---
    "first_result_card": "div[role='list'] > div[data-display-contents='true']:first-of-type",
    "first_result_link": "div[role='list'] > div[data-display-contents='true']:first-of-type a[href*='/company/']",
    "first_result_name": (
        "div[role='list'] > div[data-display-contents='true']:first-of-type a[href*='/company/'] span[aria-hidden='true'],"
        " div[role='list'] > div[data-display-contents='true']:first-of-type a[href*='/company/']"
    ),
    "first_result_subtitle": "div[role='list'] > div[data-display-contents='true']:first-of-type p:nth-of-type(1)",
    "first_result_website": None,
    # --- Top-N results for Gemini-agentic resolver ---
    # Use query_selector_all(result_cards) to get all cards, then scope each
    # card-*_within selector via card.query_selector(...). First <p> is
    # industry (e.g. "Hospitality"); second <p> is location.
    "result_cards": "div[role='list'] > div[data-display-contents='true']",
    "card_link_within": "a[href*='/company/']",
    "card_name_within": "a[href*='/company/'] span[aria-hidden='true'], a[href*='/company/']",
    "card_industry_within": "p:nth-of-type(1)",
    "card_location_within": "p:nth-of-type(2)",
}

# --- Page 2: Company overview (/company/{slug}/) ---
# The canonical /people/ route is the nav-tab anchor; the "employee count"
# link in the header goes to /search/results/people/?currentCompany=[...]
# which is a different (search) surface.
COMPANY_OVERVIEW_SELECTORS: dict[str, str | None] = {
    "company_name_h1": "h1",
    "employee_count_banner": "a[href*='/search/results/people/?currentCompany=']",
    "see_all_employees_link": "a[href$='/people/'][href*='/company/']",
}

# --- Page 3: Company people tab (/company/{slug}/people/) — CRITICAL ---
# Cards share the same `a[href*='/in/']` wrapping image + title, so query_selector
# (first match) is correct. Per-card location is usually empty in the current UI
# — LinkedIn aggregates locations in the "Where they live" module above the
# grid — but the caption slot is kept for forward compatibility.
# Connection degree: we prefer the a11y text ("2nd degree connection") over the
# visual text ("· 2nd") so downstream code gets a clean string.
PEOPLE_TAB_SELECTORS: dict[str, str | None] = {
    "employee_card": "li.org-people-profile-card__profile-card-spacing",
    "card_name": "li.org-people-profile-card__profile-card-spacing .artdeco-entity-lockup__title a[href*='/in/']",
    "card_profile_link": "li.org-people-profile-card__profile-card-spacing a[href*='/in/']",
    "card_title": "li.org-people-profile-card__profile-card-spacing .artdeco-entity-lockup__subtitle",
    "card_location": "li.org-people-profile-card__profile-card-spacing .artdeco-entity-lockup__caption",
    "card_image": "li.org-people-profile-card__profile-card-spacing .artdeco-entity-lockup__image img",
    "card_connection_degree": "li.org-people-profile-card__profile-card-spacing .artdeco-entity-lockup__badge .a11y-text",
    "show_more_btn": "button.scaffold-finite-scroll__load-button",
    # End-of-list uses :has() — supported by Camoufox (Firefox 121+) and modern
    # Chromium. If you run on an older engine, detect end inline instead:
    # (no show_more_btn present) AND (scaffold-finite-scroll--finite present).
    "end_of_list": "div.scaffold-finite-scroll--finite:not(:has(button.scaffold-finite-scroll__load-button))",
}

# --- People search (/search/results/people/?keywords=...) — fallback when
# the company has no /company/ page. We use structural selectors only:
# every search result has an `a[href*='/in/']` anchor; the surrounding
# container text includes name, headline, location, current/past role.
PEOPLE_SEARCH_SELECTORS: dict[str, str | None] = {
    "results_list": "main ul[role='list']",
    # Each result card wraps a profile link; card_container_within scopes
    # a parse to that result's text blob.
    "result_card": "li",
    "profile_link_within": "a[href*='/in/']",
}


# Regex the company /company/{slug}/ URL must match before we extract a slug.
import re
COMPANY_URL_PATTERN = re.compile(r"^https?://(?:[a-z]{2,3}\.)?linkedin\.com/company/[^/?#]+/?$")

# --- Session validity detection ---
SESSION_CHECK_SELECTORS = {
    "feed_signed_in_marker": "div.feed-identity-module, nav[aria-label*='Primary']",
    "login_page_marker": "form.login__form, input#username",
}

# --- CAPTCHA / challenge detectors ---
CHALLENGE_SELECTORS = {
    "captcha_iframe": "iframe[src*='captcha'], iframe[src*='challenge']",
    "checkpoint_input": "input[name='pin']",
}


def is_placeholder(value: str | None) -> bool:
    """True if a selector is absent, None, or still holds a TODO default."""
    if not value:
        return True
    return value == "TODO_REPLACE" or value.startswith("TODO_")
