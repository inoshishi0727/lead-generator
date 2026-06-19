// One-time backfill of lead.auto_tags from existing engagement signals.
// Mirrors computeAutoTags + runAutoTagsSweep in index.js EXACTLY — same rules
// the deployed nightly sweep uses, just triggered on-demand. Uses ADC.
//
// Usage: node backfill-autotags.mjs            (writes changes)
//        node backfill-autotags.mjs --dry-run  (preview only, no writes)
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

const DRY = process.argv.includes("--dry-run");

const ENGAGED_OPEN_THRESHOLD = 3;
const GHOSTED_WINDOW_DAYS = 7;
const GHOSTED_STAGES = new Set(["sent", "follow_up_1", "follow_up_2"]);
const ACTIVE_STAGES = ["sent", "follow_up_1", "follow_up_2", "responded"];

function computeAutoTags(lead, messages) {
  const tags = new Set();
  const msgs = Array.isArray(messages) ? messages : [];
  const openCount = Number(lead?.open_count) || 0;
  const replyCount = Number(lead?.reply_count) || 0;

  const rated = msgs
    .filter((m) => m && m.content_rating && m.content_rated_at)
    .sort((a, b) => String(b.content_rated_at).localeCompare(String(a.content_rated_at)));
  const latestRating = rated.length ? rated[0].content_rating : null;
  const anyNotInterested = msgs.some((m) => m && m.content_rating === "not_interested");
  const outcomeNotInterested = lead?.outcome === "lost" || lead?.outcome === "not_interested";

  if (outcomeNotInterested || anyNotInterested || latestRating === "not_interested") {
    tags.add("not_interested");
  } else if (latestRating === "great") {
    tags.add("hot");
  } else if (latestRating === "good") {
    tags.add("warm");
  }

  if (openCount >= ENGAGED_OPEN_THRESHOLD && replyCount === 0) {
    tags.add("engaged_no_reply");
  }

  if (GHOSTED_STAGES.has(lead?.stage) && openCount === 0 && replyCount === 0) {
    const sentTimes = msgs
      .map((m) => m && m.sent_at)
      .filter(Boolean)
      .map((t) => new Date(t).getTime())
      .filter((n) => !Number.isNaN(n));
    const lastSendMs = sentTimes.length
      ? Math.max(...sentTimes)
      : (lead?.scraped_at ? new Date(lead.scraped_at).getTime() : NaN);
    if (!Number.isNaN(lastSendMs)) {
      const ageDays = (Date.now() - lastSendMs) / (1000 * 60 * 60 * 24);
      if (ageDays > GHOSTED_WINDOW_DAYS) tags.add("ghosted");
    }
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  for (const m of msgs) {
    const rm = m && m.revisit_month;
    if (typeof rm === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(rm) && rm >= currentMonth) {
      tags.add(`revisit:${rm}`);
    }
  }
  return [...tags].sort();
}

async function main() {
  // One-time backfill scans ALL leads (incl. declined/converted) so historical
  // not_interested leads get tagged. The deployed nightly sweep stays scoped to
  // ACTIVE_STAGES for cost; the event handlers tag declined leads at decision time.
  void ACTIVE_STAGES;
  const leadsSnap = await db.collection("leads").get();
  console.log(`All leads scanned: ${leadsSnap.size}${DRY ? " (DRY RUN)" : ""}`);

  let batch = db.batch();
  let batchCount = 0;
  let updated = 0;
  const tally = {};
  const now = new Date().toISOString();

  for (const leadDoc of leadsSnap.docs) {
    const lead = leadDoc.data();
    const msgSnap = await db.collection("outreach_messages").where("lead_id", "==", leadDoc.id).get();
    const messages = msgSnap.docs.map((d) => d.data());
    const next = computeAutoTags(lead, messages);
    const current = Array.isArray(lead.auto_tags) ? lead.auto_tags : [];
    const same = current.length === next.length && current.every((t, i) => t === next[i]);
    if (same) continue;

    for (const t of next) tally[t] = (tally[t] || 0) + 1;
    if (next.length) {
      console.log(`  ${(lead.business_name || leadDoc.id).slice(0, 40).padEnd(40)} → ${next.join(", ")}`);
    }

    if (!DRY) {
      batch.update(leadDoc.ref, { auto_tags: next, auto_tags_updated_at: now });
      batchCount += 1;
      if (batchCount >= 450) { await batch.commit(); batch = db.batch(); batchCount = 0; }
    }
    updated += 1;
  }

  if (!DRY && batchCount > 0) await batch.commit();
  console.log(`\nLeads ${DRY ? "that would be updated" : "updated"}: ${updated}`);
  console.log("Tag tally:", JSON.stringify(tally, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
