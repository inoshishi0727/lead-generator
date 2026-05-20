// One-off: backfill generation_log and generation_history from existing outreach_messages.
// Run: cd functions && node backfill-generation-log.mjs
//
// Logic:
//   provider == "gemini"  → generation_source = "gemini"
//   provider == "claude"  → generation_source = "claude"
//   no provider field     → generation_source = "v1" (initial system generation)
//   Any existing generation_log entries for a message_id are skipped (idempotent).

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

const BATCH_SIZE = 400;

function deriveSource(provider) {
  if (provider === "gemini") return "gemini";
  if (provider === "claude") return "claude";
  return "v1";
}

console.log("Loading existing generation_log entries to skip duplicates...");
const existingSnap = await db.collection("generation_log").get();
const alreadyLogged = new Set(existingSnap.docs.map((d) => d.data().message_id).filter(Boolean));
console.log(`  ${alreadyLogged.size} messages already have log entries — will skip.\n`);

console.log("Loading all outreach_messages...");
const msgsSnap = await db.collection("outreach_messages").get();
console.log(`  ${msgsSnap.size} messages total.\n`);

const toBackfill = msgsSnap.docs.filter((d) => !alreadyLogged.has(d.id));
console.log(`  ${toBackfill.length} messages to backfill.\n`);

let written = 0;
let skipped = 0;
let batch = db.batch();
let batchCount = 0;

for (const doc of toBackfill) {
  const d = doc.data();

  // Skip messages with no content (planned stubs, etc.)
  if (!d.content && !d.subject) {
    skipped++;
    continue;
  }

  const generation_source = deriveSource(d.provider);
  const entry = {
    message_id: doc.id,
    lead_id: d.lead_id || "",
    business_name: d.business_name || "",
    subject: d.subject || "",
    content: d.content || "",
    generation_source,
    step_number: d.step_number || 1,
    venue_category: d.venue_category || null,
    generated_at: d.created_at || new Date().toISOString(),
  };

  // Write to generation_log collection
  const logRef = db.collection("generation_log").doc();
  batch.set(logRef, entry);

  // Write to per-message subcollection
  const historyRef = db.collection("outreach_messages").doc(doc.id)
    .collection("generation_history").doc();
  batch.set(historyRef, entry);

  batchCount += 2;
  written++;

  if (batchCount >= BATCH_SIZE) {
    await batch.commit();
    console.log(`  Committed batch — ${written} messages written so far...`);
    batch = db.batch();
    batchCount = 0;
  }
}

if (batchCount > 0) {
  await batch.commit();
}

console.log("\n" + "=".repeat(60));
console.log(`DONE`);
console.log(`  Written:  ${written}`);
console.log(`  Skipped:  ${skipped} (no content)`);
console.log(`  Already had logs: ${alreadyLogged.size}`);
console.log("=".repeat(60));
