// List leads written in the last N minutes. Use this to verify a recent
// scrape actually wrote leads to Firestore.
//
// Queries `scraped_at` (not `created_at`) because that's the field every
// lead-create path actually writes. `created_at` is set on newer writes
// only; older docs lack it and Firestore would silently exclude them.
//
// Run from project root:
//   node functions/check-recent-scrapes.mjs            # default: last 60 min
//   node functions/check-recent-scrapes.mjs 15         # last 15 min
//   node functions/check-recent-scrapes.mjs 1440       # last 24 h
//   node functions/check-recent-scrapes.mjs 11520      # last 8 days

import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const minutes = Number(process.argv[2] || 60);
if (!Number.isFinite(minutes) || minutes <= 0) {
  console.error("Usage: node check-recent-scrapes.mjs [minutes]");
  process.exit(1);
}

const app = getApps().length > 0
  ? getApps()[0]
  : initializeApp({ credential: applicationDefault(), projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();

console.log(`\n=== Leads written since ${since} (last ${minutes} min) ===\n`);

const snap = await db.collection("leads")
  .where("scraped_at", ">=", since)
  .get();

if (snap.empty) {
  console.log("No new leads in that window.");
} else {
  // Sort newest-first (Firestore where() doesn't include ordering here).
  const rows = snap.docs
    .map((d) => d.data())
    .sort((a, b) => String(b.scraped_at || "").localeCompare(String(a.scraped_at || "")));

  console.log(`Found ${rows.length} lead(s):\n`);
  for (const l of rows) {
    const ts = String(l.scraped_at || l.created_at || "").slice(0, 19).replace("T", " ");
    const source = l.source || "?";
    const stage = l.stage || "?";
    const where = l.website || l.address || "—";
    console.log(`  ${ts}  [${source.padEnd(14)}] ${l.business_name}`);
    console.log(`                       stage=${stage}  ${where}`);
  }
}

console.log(`\n=== Recent scrape_runs (last 10) ===\n`);
const runs = await db.collection("scrape_runs")
  .orderBy("started_at", "desc")
  .limit(10)
  .get();

if (runs.empty) {
  console.log("No scrape_runs found.");
} else {
  for (const doc of runs.docs) {
    const r = doc.data();
    const started = String(r.started_at || "").slice(0, 19).replace("T", " ");
    console.log(`  ${started}  status=${r.status || "?"}  leads=${r.leads_found ?? 0}  query="${(r.queries || r.query || "").toString().slice(0, 40)}"`);
  }
}
