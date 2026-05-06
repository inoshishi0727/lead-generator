// One-shot health check for the LinkedIn scraper.
// Reads pipeline_jobs + linkedin_employees + leads.linkedin_status to summarize
// recent run health. Run via: node linkedin-health-check.mjs

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault(), projectId: "asterley-bros-b29c0" });
const db = getFirestore();

const now = new Date();
const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

async function main() {
  const [empSnap, leadsSnap] = await Promise.all([
    db.collection("linkedin_employees").where("scraped_at", ">=", since30d).get(),
    db.collection("leads").get(),
  ]);

  // Employees scraped per day, last 30
  const byDay = new Map();
  let decisionMakers = 0;
  for (const d of empSnap.docs) {
    const m = d.data();
    const day = String(m.scraped_at || "").slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
    if (m.is_decision_maker) decisionMakers += 1;
  }

  // Leads breakdown
  let scraped = 0, blocked = 0, sessionExpired = 0, errored = 0, neverRun = 0, recentlyScraped = 0;
  let lastScrapeAt = null;
  for (const d of leadsSnap.docs) {
    const l = d.data();
    const status = l.linkedin_status;
    if (!status || status === "pending") neverRun += 1;
    else if (status === "scraped" || status === "completed") scraped += 1;
    else if (status === "blocked") blocked += 1;
    else if (status === "session_expired") sessionExpired += 1;
    else if (status === "error" || status === "failed") errored += 1;

    const ts = l.linkedin_scraped_at;
    if (ts) {
      if (!lastScrapeAt || ts > lastScrapeAt) lastScrapeAt = ts;
      if (ts >= since7d) recentlyScraped += 1;
    }
  }

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    last7Days.push([key, byDay.get(key) || 0]);
  }

  console.log("===== LinkedIn Scraper Health =====");
  console.log(`Total leads: ${leadsSnap.size}`);
  console.log(`  scraped/completed:    ${scraped}`);
  console.log(`  never run/pending:    ${neverRun}`);
  console.log(`  blocked:              ${blocked}`);
  console.log(`  session expired:      ${sessionExpired}`);
  console.log(`  errored:              ${errored}`);
  console.log(`  scraped in last 7d:   ${recentlyScraped}`);
  console.log(`Last scrape timestamp:  ${lastScrapeAt || "none"}`);
  console.log(`\nEmployees collected (last 30d): ${empSnap.size}`);
  console.log(`  decision makers:      ${decisionMakers}`);
  console.log(`\nEmployees per day (last 7):`);
  for (const [day, n] of last7Days) {
    const bar = "█".repeat(Math.min(n, 40));
    console.log(`  ${day}  ${String(n).padStart(4)} ${bar}`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
