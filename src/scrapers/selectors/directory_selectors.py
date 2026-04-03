"""Directory site selectors — sourced from live DOM 2026-04-03.

Trustpilot uses CSS module hashes (e.g. styles_card__WMwue) that change
between deployments. Always use partial match selectors [class*="styles_card__"].
"""

# ============================================================
# Yell.com
# ============================================================

YELL_LISTING_CARD = "article.businessCapsule"
YELL_BUSINESS_NAME = ".businessCapsule--name"          # H2 text
YELL_BUSINESS_LINK = "a.businessCapsule--title"        # clickable name link
YELL_WEBSITE_LINK = "a[data-tracking='FLE:WL:CLOSED']"
YELL_PHONE = "span[itemprop='telephone']"              # hidden by default
YELL_PHONE_REVEAL = "button[data-tracking='LIST:PHONE']"  # "Show number" button
YELL_ADDRESS = "a.businessCapsule--address"
YELL_NEXT_PAGE = "a.pagination--next"

# Yell uses Usercentrics — may need shadow DOM access for EU visitors
YELL_CONSENT_SELECTORS = [
    "#uc-cross-domain-consent-sharing-bridge",
]

# ============================================================
# Trustpilot
# ============================================================

TP_LISTING_CARD = "div[class*='styles_card__']"
TP_BUSINESS_NAME = "p"                                  # first <p> child in card content
TP_BUSINESS_LINK = "a"                                  # card wrapper is the link
TP_RATING = "p[class*='styles_ratingText__']"
TP_RATING_STARS = "img[alt*='TrustScore']"
TP_REVIEW_COUNT = "[class*='styles_reviewCount__']"
TP_NEXT_PAGE = "a[name='pagination-button-next']"       # inside nav[aria-label="Pagination"]

TP_CONSENT_SELECTORS = [
    "#onetrust-accept-btn-handler",
]
