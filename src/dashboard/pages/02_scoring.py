"""Scoring page — view score breakdowns and adjust weights."""

import streamlit as st

from src.config.loader import load_config

st.header("Scoring Configuration")

config = load_config()
weights = config.scoring.weights.model_dump()

st.subheader("Current Weights")
st.markdown(f"**Minimum threshold:** {config.scoring.min_score_threshold}")

cols = st.columns(3)
updated_weights = {}
for i, (rule, weight) in enumerate(weights.items()):
    with cols[i % 3]:
        updated_weights[rule] = st.slider(
            rule.replace("_", " ").title(),
            min_value=0,
            max_value=30,
            value=weight,
            key=rule,
        )

if st.button("Re-score All Leads"):
    st.info("Re-scoring with updated weights... (connect Firebase to enable)")

st.subheader("Score Distribution")
st.info("Connect to Firebase to view score distribution chart.")
