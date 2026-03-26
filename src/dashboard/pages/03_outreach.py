"""Outreach page — approve, reject, or regenerate message drafts."""

import streamlit as st

st.header("Outreach Drafts")

# Filter by status
status_filter = st.selectbox("Status", ["All", "Draft", "Approved", "Rejected", "Sent"])

st.info(
    "Connect to Firebase to load outreach drafts. "
    "Drafts are generated via Gemini and require human approval before sending."
)

# Placeholder for draft cards
st.markdown("### Pending Drafts")
st.markdown("No drafts to display. Run the draft generation pipeline first.")

# Action buttons (placeholder)
col1, col2, col3 = st.columns(3)
with col1:
    if st.button("Generate New Drafts"):
        st.info("Set GEMINI_API_KEY in .env and connect Firebase to enable.")
with col2:
    if st.button("Approve All Visible"):
        st.warning("No drafts selected.")
with col3:
    if st.button("Send Approved"):
        st.warning("No approved messages to send.")
