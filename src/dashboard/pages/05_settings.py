"""Settings page — configuration and run controls."""

import asyncio
import os
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from src.config.loader import load_config

load_dotenv()

st.header("Settings")

config = load_config()

# API Key status
st.subheader("API Keys")

keys = {
    "GOOGLE_APPLICATION_CREDENTIALS": os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"),
    "GEMINI_API_KEY": os.environ.get("GEMINI_API_KEY"),
    "ANTHROPIC_API_KEY": os.environ.get("ANTHROPIC_API_KEY"),
    "RESEND_API_KEY": os.environ.get("RESEND_API_KEY"),
}

for key, value in keys.items():
    status = "Configured" if value and not value.startswith("your-") else "Not set"
    icon = "+" if status == "Configured" else "-"
    st.markdown(f"- [{icon}] **{key}**: {status}")

st.divider()

# Rate limits
st.subheader("Rate Limits")
col1, col2 = st.columns(2)
with col1:
    st.number_input("Google Maps RPM", value=config.rate_limits.google_maps_rpm)
    st.number_input("Instagram RPM", value=config.rate_limits.instagram_rpm)
with col2:
    st.number_input("Gemini RPM", value=config.rate_limits.gemini_rpm)
    st.number_input("Resend RPM", value=config.rate_limits.resend_rpm)

st.divider()

# Manual run triggers
st.subheader("Manual Run Controls")

col1, col2 = st.columns(2)

with col1:
    st.markdown("**Google Maps Scraper**")
    query = st.selectbox("Search query", config.scraping.google_maps.search_queries)
    limit = st.slider("Max leads", min_value=1, max_value=60, value=5)
    headless = st.checkbox("Headless mode", value=False)

    if st.button("Run Google Maps Scraper", type="primary"):
        from src.scrapers.gmaps import GoogleMapsScraper

        run_config = config.model_copy(deep=True)
        run_config.scraping.google_maps.search_queries = [query]
        run_config.scraping.google_maps.target_count = limit
        run_config.scraping.google_maps.headless = headless

        scraper = GoogleMapsScraper(config=run_config)

        with st.spinner(f"Scraping '{query}' (max {limit} leads)..."):
            leads = asyncio.run(scraper.run())

        if leads:
            st.success(f"Found {len(leads)} leads!")

            # Show results table
            rows = []
            for lead in leads:
                rows.append({
                    "Business Name": lead.business_name,
                    "Address": lead.address or "",
                    "Phone": lead.phone or "",
                    "Website": lead.website or "",
                    "Rating": lead.rating or "",
                    "Reviews": lead.review_count or "",
                    "Category": lead.category or "",
                })
            st.dataframe(rows, use_container_width=True)

            # Save to CSV
            import csv

            out_path = Path("leads.csv")
            fields = ["business_name", "address", "phone", "website", "rating", "review_count", "category"]
            with open(out_path, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fields)
                writer.writeheader()
                for lead in leads:
                    writer.writerow({k: getattr(lead, k, None) for k in fields})
            st.caption(f"Saved to {out_path.resolve()}")
        else:
            st.warning("No leads found.")

with col2:
    if st.button("Run Instagram Scraper"):
        st.info("Scraper would start... (connect services to enable)")
    if st.button("Run Scoring Engine"):
        st.info("Scoring would start... (configure Firebase to enable)")
    if st.button("Generate Drafts"):
        st.info("Draft generation would start... (connect services to enable)")
