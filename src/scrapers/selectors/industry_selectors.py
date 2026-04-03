"""Industry site selectors — sourced from live DOM 2026-04-03.

These are editorial/trade sites, not business directories.
Their "listings" are article search results with limited structured data.
External website links are not available in listings — only internal
article pages. The enrichment pipeline handles company identification.
"""

SITE_SELECTORS: dict[str, dict[str, str]] = {
    # ---------------------------------------------------------
    # The Spirits Business — thespiritsbusiness.com
    # News/trade publication. Cards are article listings.
    # ---------------------------------------------------------
    "spirits_business": {
        "listing_card": "div.col-md-4.mb-4",
        "name": "h2.u-fs-h-small.mb-3",
        "website": "a.d-block",                      # card wrapper link (internal article)
        "description": None,                          # no snippet in search results
        "date": "time.c-post-date",
        "author": "span.c-post-author",
        "next_page": "a.next",                        # among .page-numbers links
        "consent": "button.moove-gdpr-infobar-allow-all",
    },
    # ---------------------------------------------------------
    # Difford's Guide — diffordsguide.com
    # Bars search results. No external website links in listings.
    # ---------------------------------------------------------
    "diffords_guide": {
        "listing_card": "div.link-box.link-box--square-image",
        "name": "h3.link-box__title a",
        "website": "a.link-box__image-frame",         # internal detail page link
        "description": ".link-box__body",             # contains City: and Country: inline
        "next_page": ".button-group--pagination button:has-text('Next')",
        "consent": None,                              # no consent banner detected
    },
    # ---------------------------------------------------------
    # Drinks International — drinksint.com
    # News/trade publication. No pagination.
    # ---------------------------------------------------------
    "drinks_international": {
        "listing_card": "div.middleArticle",
        "listing_card_featured": "#topNews",          # featured article is separate
        "name": "h2.headline a",
        "name_featured": "#topNewsHeadline",
        "website": "h2.headline a",                   # internal article link
        "description": "div.summary p strong",
        "date": "div.publication_date span.paramv",
        "next_page": None,                            # no pagination — all results on one page
        "consent": None,                              # no consent banner detected
    },
}
