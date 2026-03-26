"""Pipeline page — visual funnel and stage management."""

import streamlit as st

from src.db.models import PipelineStage

st.header("Pipeline")

# Stage funnel visualization
st.subheader("Lead Funnel")

stages = [s.value for s in PipelineStage]
# Placeholder counts
counts = {s: 0 for s in stages}

for stage in stages:
    col1, col2 = st.columns([1, 4])
    with col1:
        st.metric(stage.replace("_", " ").title(), counts[stage])
    with col2:
        st.progress(0)

st.divider()

st.subheader("Stage Management")
st.info(
    "Connect to Firebase to manage lead stages. "
    "Select leads and advance them through the pipeline."
)

# Follow-up section
st.subheader("Pending Follow-ups")
st.markdown("No follow-ups due. Leads will appear here when follow-up timing is reached.")
