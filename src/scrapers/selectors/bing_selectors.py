"""Bing Search selectors — sourced from live DOM 2026-04-03."""

# --- Search input ---
SEARCH_INPUT = "#sb_form_q"

# --- Consent / cookie dialog (EU only) ---
CONSENT_ACCEPT_SELECTORS = [
    "#bnp_btn_accept",
    "#bnp_container button",
]

# --- Organic result containers ---
# Parent list is ol#b_results, organic results are li.b_algo.
RESULT_CONTAINER = "#b_results > li.b_algo"

# --- Within each result ---
RESULT_TITLE_LINK = "h2 a"
RESULT_LINK = "h2 a"
# Use both snippet selectors as fallback
RESULT_SNIPPET = ".b_caption p, p.b_lineclamp2"
RESULT_DISPLAYED_URL = "cite"

# --- Ads (skip these) ---
AD_CONTAINER = "#b_results > li.b_ad"

# --- Pagination / "Next" button ---
NEXT_PAGE = "a.sb_pagN, .b_pag a[title='Next page']"

# --- Result count ---
RESULT_COUNT = "span.sb_count"
