"""
Backfill menu_url for leads that don't have one.

Visits each lead's website (homepage + /menu + /drinks sub-pages) and
extracts <a href> links that look like menu pages or PDF files.

Writes:
  - menu_url = <extracted URL>  when found
  - menu_url = "not_found"      when we looked but couldn't find one

Safe to re-run — only processes leads where menu_url is absent.
Pass --force to re-check all leads regardless.

Usage:
    cd /Users/kothings/Downloads/lead-generator
    uv run python scripts/backfill_menu_url.py
    uv run python scripts/backfill_menu_url.py --force
    uv run python scripts/backfill_menu_url.py --limit 20
"""

import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

from google.cloud import firestore

FORCE = "--force" in sys.argv
LIMIT = 50
for arg in sys.argv:
    if arg.startswith("--limit="):
        LIMIT = int(arg.split("=")[1])

MENU_PATH_RE = re.compile(r"/(menu|drinks|wine-?list|cocktails|food-drink)\b", re.I)
PDF_MENU_RE = re.compile(r"menu|drink|wine|cocktail|food|beverage", re.I)
HREF_RE = re.compile(r'<a[^>]+href=["\']([^"\'#][^"\']*?)["\']', re.I)

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; AsterleyBot/1.0)"}


def fetch_html(url: str, timeout: int = 8) -> str | None:
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            charset = resp.headers.get_content_charset() or "utf-8"
            return resp.read().decode(charset, errors="replace")
    except Exception:
        return None


def extract_menu_url(html: str, base_url: str) -> str | None:
    links = HREF_RE.findall(html)
    absolute = []
    for link in links:
        try:
            abs_link = urllib.parse.urljoin(base_url, link)
            if abs_link.startswith("http"):
                absolute.append(abs_link)
        except Exception:
            pass

    # Priority 1: PDF with menu/drinks keyword
    for l in absolute:
        if l.lower().endswith(".pdf") and PDF_MENU_RE.search(l):
            return l

    # Priority 2: Any PDF
    for l in absolute:
        if l.lower().endswith(".pdf"):
            return l

    # Priority 3: Page path with menu/drinks keyword
    for l in absolute:
        parsed = urllib.parse.urlparse(l)
        if MENU_PATH_RE.search(parsed.path):
            return l

    return None


def find_menu_url(website: str) -> str | None:
    clean = website if website.startswith("http") else f"https://{website}"
    parsed = urllib.parse.urlparse(clean)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    html = fetch_html(clean)
    if html:
        found = extract_menu_url(html, clean)
        if found:
            return found

    for path in ["/menu", "/drinks", "/food-drink", "/wine-list", "/cocktails"]:
        sub_url = origin + path
        html = fetch_html(sub_url)
        if html:
            found = extract_menu_url(html, sub_url)
            if found:
                return found

    return None


db = firestore.Client(project="asterley-bros-b29c0")

print("Fetching leads...")
leads_snap = db.collection("leads").stream()
all_leads = [{"id": doc.id, **doc.to_dict()} for doc in leads_snap]

to_process = [
    l for l in all_leads
    if l.get("website") and (FORCE or not l.get("menu_url"))
][:LIMIT]

print(f"Processing {len(to_process)} leads (limit={LIMIT}, force={FORCE})...")

found_count = 0
not_found_count = 0
failed_count = 0

for lead in to_process:
    name = lead.get("business_name", lead["id"])
    website = lead["website"]
    try:
        menu_url = find_menu_url(website)
        if menu_url:
            db.collection("leads").document(lead["id"]).update({"menu_url": menu_url})
            print(f"  ✓ {name} — {menu_url[:80]}")
            found_count += 1
        else:
            db.collection("leads").document(lead["id"]).update({"menu_url": "not_found"})
            print(f"  — {name}: not found")
            not_found_count += 1
        time.sleep(0.3)  # gentle rate limiting
    except Exception as e:
        print(f"  ✗ {name}: {e}")
        failed_count += 1

print(f"\nDone. Found: {found_count}, Not found: {not_found_count}, Failed: {failed_count}")
