"""Leads page — browse, filter, and search all discovered leads."""

import streamlit as st

st.header("Leads")

# Filters
col1, col2, col3 = st.columns(3)
with col1:
    source_filter = st.selectbox("Source", ["All", "Google Maps", "Instagram"])
with col2:
    stage_filter = st.selectbox(
        "Stage",
        ["All", "scraped", "needs_email", "scored", "draft_generated", "approved", "sent"],
    )
with col3:
    search = st.text_input("Search by name")

# Load leads from Firestore
try:
    from src.db.firestore import get_leads

    leads = get_leads(
        source=source_filter if source_filter != "All" else None,
        stage=stage_filter if stage_filter != "All" else None,
        search=search or None,
    )

    if leads:
        rows = []
        for lead in leads:
            rows.append({
                "Business Name": lead.get("business_name", ""),
                "Source": lead.get("source", ""),
                "Email": lead.get("email", ""),
                "Score": lead.get("score", ""),
                "Stage": lead.get("stage", ""),
                "Website": lead.get("website", ""),
                "Phone": lead.get("phone", ""),
            })
        st.dataframe(rows, use_container_width=True)
    else:
        st.info("No leads found matching your filters.")

except Exception:
    st.warning(
        "Configure GOOGLE_APPLICATION_CREDENTIALS in your .env file "
        "to connect to Firebase and load leads."
    )
    st.dataframe(
        data={
            "Business Name": [],
            "Source": [],
            "Email": [],
            "Score": [],
            "Stage": [],
            "Website": [],
            "Phone": [],
        },
        use_container_width=True,
    )
