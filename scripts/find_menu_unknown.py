"""Find leads where menu_fit is unknown or drinks_programme is null.

These are the best candidates for re-testing the improved fetcher
(PDF/image menu extraction, CDN PDF fix, Gemini Vision fallback).

Usage:
    uv run python scripts/find_menu_unknown.py
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.client import get_firestore_client

db = get_firestore_client()

docs = db.collection("leads").stream()

unknown_menu = []
no_drinks = []

for doc in docs:
    d = doc.to_dict()
    enrichment = d.get("enrichment") or {}
    status = enrichment.get("enrichment_status")
    menu_fit = enrichment.get("menu_fit")
    drinks = enrichment.get("drinks_programme")
    website = d.get("website") or ""

    if not website or status != "success":
        continue

    if menu_fit in ("unknown", None):
        unknown_menu.append({
            "name": d.get("business_name", "?"),
            "website": website,
            "category": d.get("category", ""),
            "id": doc.id,
        })
    elif drinks is None:
        no_drinks.append({
            "name": d.get("business_name", "?"),
            "website": website,
            "category": d.get("category", ""),
            "menu_fit": menu_fit,
            "id": doc.id,
        })

print(f"\n{'='*60}")
print(f"menu_fit=unknown ({len(unknown_menu)} leads)")
print(f"{'='*60}")
for lead in unknown_menu[:20]:
    print(f"  {lead['name']}")
    print(f"    website:  {lead['website']}")
    print(f"    category: {lead['category']}")
    print(f"    id:       {lead['id']}")
    print()

print(f"\n{'='*60}")
print(f"drinks_programme=null ({len(no_drinks)} leads)")
print(f"{'='*60}")
for lead in no_drinks[:20]:
    print(f"  {lead['name']}")
    print(f"    website:   {lead['website']}")
    print(f"    category:  {lead['category']}")
    print(f"    menu_fit:  {lead['menu_fit']}")
    print(f"    id:        {lead['id']}")
    print()

print(f"{'='*60}")
print(f"TOTALS: menu_fit=unknown={len(unknown_menu)}  drinks=null={len(no_drinks)}")
print(f"{'='*60}")

# Pick 3 URLs to test with test_fetcher.py
candidates = (unknown_menu + no_drinks)[:3]
if candidates:
    urls = " ".join(f'"{l["website"]}"' for l in candidates)
    print(f"\nRun fetcher-only test (fast, no Gemini):")
    print(f"  PROXY_HOST= PROXY_PORT= uv run python scripts/test_fetcher.py {urls}")
    print(f"\nRun full end-to-end enrichment test (fetch + Gemini analysis):")
    print(f"  PROXY_HOST= PROXY_PORT= uv run python scripts/test_enrichment_e2e.py {urls}")
