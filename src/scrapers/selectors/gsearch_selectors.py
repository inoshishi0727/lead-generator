"""Google Search selectors — sourced from live DOM 2026-04-03.

Google uses obfuscated class names that change over time.
Prefer structural selectors (#rso a h3) over class-based (div.yuRUbf)
for stability. Check and update periodically.
"""

# --- Search input ---
SEARCH_INPUT = "textarea[name='q']"

# --- Consent / cookie dialog (EU only) ---
CONSENT_ACCEPT_SELECTORS = [
    "button#L2AGLb",
    "form[action*='consent.google'] button",
    "div.dbsFrd button",
]

# --- Organic result containers ---
# div.MjjYud is the wrapper, div.tF2Cxc is the individual result.
# Parent is #rso.
RESULT_CONTAINER = "#rso div.tF2Cxc"
RESULT_WRAPPER = "#rso div.MjjYud"

# --- Within each result ---
RESULT_TITLE_LINK = "div.yuRUbf a"    # <a> wrapping <h3>
RESULT_TITLE_H3 = "#rso a h3"         # stable structural fallback
RESULT_LINK = "div.yuRUbf a"
RESULT_SNIPPET = "div.VwiC3b"

# --- "People also ask" (skip these) ---
PAA_CONTAINER = "[jsname='yEVEwb'], [data-sgrd], [data-initq]"

# --- Ads (skip these) ---
AD_CONTAINER_TOP = "#tads"
AD_CONTAINER_BOTTOM = "#tadsb"
AD_ITEM = "div[data-text-ad]"

# --- Pagination / "Next" button ---
NEXT_PAGE = "a#pnnext"

# --- Result stats ---
RESULT_STATS = "div#result-stats"
