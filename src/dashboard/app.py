"""Streamlit dashboard — DEPRECATED. Use Next.js frontend + FastAPI backend instead.

Run the new dashboard:
  Backend:  uv run uvicorn main:app --reload
  Frontend: cd frontend && npm run dev
"""

import streamlit as st

st.set_page_config(
    page_title="Asterley Bros — Lead Generation",
    page_icon="🍸",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.title("Asterley Bros — Lead Generation & Outreach")

st.markdown("""
Welcome to the Asterley Bros lead generation dashboard. Use the sidebar
to navigate between pages:

- **Leads** — Browse and filter all discovered leads
- **Scoring** — View score breakdowns and adjust weights
- **Outreach** — Approve, reject, or regenerate message drafts
- **Pipeline** — Visual funnel and stage management
- **Settings** — Configuration and run controls
""")

st.sidebar.success("Select a page above to get started.")
