"""One-time cleanup + key migration for duplicate lead docs.

The old dedup key varied run-to-run (name-only normalization, website-vs-address
flip), so the same venue produced multiple `leads` docs. This script:

  1. Groups existing leads that share ANY dedup representation (stable
     google_maps place_id, tightened name|domain, or a stored universal key).
  2. Picks one canonical doc per group (prefers an enriched doc, then the
     richest, then the oldest), migrates `lead_id` references off the losers
     (outreach_messages, linkedin_employees, activity_log), and deletes them.
  3. Backfills the NEW deterministic dedup_key / universal_dedup_key /
     dedup_universals onto every surviving doc and (re)writes its dedup_claims
     doc, so future scrapes match instead of forking a new doc.

Safe by default: runs in --dry-run mode (prints the plan, writes nothing).
Pass --apply to perform the changes.

Usage:
    uv run python scripts/dedupe_leads.py            # dry-run
    uv run python scripts/dedupe_leads.py --apply    # perform
"""

from __future__ import annotations

import sys
from hashlib import sha1
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

from src.db.client import get_firestore_client
from src.db.firestore import get_leads
from src.db.dedup import build_universal_key

APPLY = "--apply" in sys.argv


# ----------------------------------------------------- representation keys


def _place_id(lead: dict) -> str | None:
    return lead.get("google_maps_place_id") or None


def _site(lead: dict) -> str | None:
    return lead.get("website") or lead.get("address") or None


def _representations(lead: dict) -> list[str]:
    """All dedup keys this lead could be found by (new + stored)."""
    name = lead.get("business_name") or ""
    reps: list[str] = []
    pid = _place_id(lead)
    if pid:
        reps.append(build_universal_key(name, _site(lead), pid))  # gmaps:<id>
    reps.append(build_universal_key(name, _site(lead), None))     # name|domain
    # Stored representations catch dupes that only shared the OLD-format key.
    if lead.get("universal_dedup_key"):
        reps.append(lead["universal_dedup_key"])
    for u in (lead.get("dedup_universals") or []):
        reps.append(u)
    return [r for r in dict.fromkeys(reps) if r]


def _primary_universal(lead: dict) -> str:
    return build_universal_key(lead.get("business_name") or "", _site(lead), _place_id(lead))


def _new_universals(lead: dict) -> list[str]:
    name = lead.get("business_name") or ""
    prim = build_universal_key(name, _site(lead), _place_id(lead))
    alt = build_universal_key(name, _site(lead), None)
    return list(dict.fromkeys([prim, alt]))


# ----------------------------------------------------- union-find grouping


def _group_leads(leads: list[dict]) -> list[list[dict]]:
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    # Union each lead's own id with every representation it exposes.
    for lead in leads:
        lid = f"lead:{lead['id']}"
        find(lid)
        for rep in _representations(lead):
            union(lid, f"rep:{rep}")

    groups: dict[str, list[dict]] = {}
    for lead in leads:
        root = find(f"lead:{lead['id']}")
        groups.setdefault(root, []).append(lead)
    return list(groups.values())


def _richness(lead: dict) -> tuple:
    """Rank for canonical selection: enriched first, then most populated."""
    enrichment = lead.get("enrichment") or {}
    status = (enrichment.get("enrichment_status") if isinstance(enrichment, dict) else None) or ""
    enriched = 1 if status in ("success", "enriched") else 0
    populated = sum(
        1 for k in ("website", "phone", "email", "address", "menu_text", "menu_url", "category")
        if lead.get(k) or (isinstance(enrichment, dict) and enrichment.get(k))
    )
    return (enriched, populated)


def _age(lead: dict) -> str:
    """ISO timestamp used to break ties toward the OLDEST doc."""
    return lead.get("scraped_at") or lead.get("created_at") or "9999"


def _canonical(group: list[dict]) -> dict:
    """Best doc in a group: richest, oldest on ties."""
    best = max(_richness(l) for l in group)
    tied = [l for l in group if _richness(l) == best]
    return min(tied, key=_age)


# ----------------------------------------------------- reference migration


_REF_COLLECTIONS = [
    ("outreach_messages", "lead_id"),
    ("linkedin_employees", "lead_id"),
    ("activity_log", "entity_id"),
]


def _migrate_refs(db, old_id: str, new_id: str) -> int:
    from google.cloud.firestore_v1.base_query import FieldFilter
    moved = 0
    for coll, field in _REF_COLLECTIONS:
        try:
            docs = db.collection(coll).where(filter=FieldFilter(field, "==", old_id)).stream()
            for d in docs:
                moved += 1
                if APPLY:
                    db.collection(coll).document(d.id).update({field: new_id})
        except Exception as exc:
            print(f"    ! ref migrate failed on {coll}: {exc}")
    return moved


# ----------------------------------------------------- main


def main() -> None:
    db = get_firestore_client()
    if db is None:
        print("ERROR: Firestore not available")
        sys.exit(1)

    leads = get_leads()
    print(f"Loaded {len(leads)} leads  |  mode={'APPLY' if APPLY else 'DRY-RUN'}\n")

    groups = _group_leads(leads)
    dup_groups = [g for g in groups if len(g) > 1]
    print(f"{len(groups)} venue groups, {len(dup_groups)} with duplicates\n")

    deleted = 0
    refs_moved = 0
    for g in dup_groups:
        canonical = _canonical(g)
        losers = [l for l in g if l["id"] != canonical["id"]]

        print(f"• {canonical.get('business_name','?')}  keep={canonical['id'][:8]}  drop={len(losers)}")
        for l in losers:
            n = _migrate_refs(db, l["id"], canonical["id"])
            refs_moved += n
            print(f"    - drop {l['id'][:8]} ({l.get('business_name','?')})  refs_moved={n}")
            if APPLY:
                db.collection("leads").document(l["id"]).delete()
            deleted += 1

    # Backfill new keys + claim docs onto every SURVIVING lead.
    survivors = {l["id"]: l for l in leads}
    for g in dup_groups:
        keep_id = _canonical(g)["id"]
        for l in g:
            if l["id"] != keep_id:
                survivors.pop(l["id"], None)

    backfilled = 0
    backfill_skipped = 0
    for l in survivors.values():
        universals = _new_universals(l)
        primary = _primary_universal(l)
        from src.db.dedup import build_dedup_key
        new_key = build_dedup_key(
            (l.get("source") or "google_maps"),
            l.get("business_name") or "",
            _site(l),
            _place_id(l),
        )
        if APPLY:
            # Tolerant + idempotent: a survivor may have been deleted by a
            # concurrent writer since the initial read — skip it rather than
            # abort the whole backfill, so the script is safe to re-run.
            try:
                db.collection("leads").document(l["id"]).update({
                    "dedup_key": new_key,
                    "universal_dedup_key": primary,
                    "dedup_universals": universals,
                })
                claim_id = sha1(primary.encode("utf-8")).hexdigest()
                db.collection("dedup_claims").document(claim_id).set({
                    "universal_dedup_key": primary,
                    "dedup_key": new_key,
                    "business_name": l.get("business_name"),
                })
            except Exception as exc:
                backfill_skipped += 1
                print(f"  ! skip backfill {l['id'][:8]} ({l.get('business_name','?')}): {exc}")
                continue
        backfilled += 1

    print(f"\nSummary ({'APPLIED' if APPLY else 'DRY-RUN — nothing written'}):")
    print(f"  duplicate docs deleted:   {deleted}")
    print(f"  references migrated:      {refs_moved}")
    print(f"  survivors key-backfilled: {backfilled}")
    if backfill_skipped:
        print(f"  backfill skipped (stale): {backfill_skipped}")
    if not APPLY:
        print("\nRe-run with --apply to perform these changes.")


if __name__ == "__main__":
    main()
