/**
 * One-time script: remove duplicate draft/approved outreach messages.
 *
 * A duplicate is any email message (non-client-campaign) sharing the same
 * lead_id + step_number with status "draft" or "approved".
 *
 * For each duplicate group, keeps the NEWEST document (by created_at) and
 * deletes the rest.
 *
 * Run with:  node scripts/dedup-drafts.mjs
 * Dry run:   node scripts/dedup-drafts.mjs --dry-run
 */

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const DRY_RUN = process.argv.includes("--dry-run");

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

async function main() {
  console.log(DRY_RUN ? "DRY RUN — no deletes will happen\n" : "LIVE RUN — duplicates will be deleted\n");

  const snap = await db.collection("outreach_messages")
    .where("status", "in", ["draft", "approved"])
    .get();

  const msgs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => !m.is_client_campaign);

  console.log(`Found ${msgs.length} draft/approved messages total`);

  // Group by lead_id:step_number
  const groups = new Map();
  for (const msg of msgs) {
    const key = `${msg.lead_id}:${msg.step_number ?? 1}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(msg);
  }

  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`Found ${dupGroups.length} lead+step combinations with duplicates\n`);

  if (dupGroups.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  const toDelete = [];

  for (const group of dupGroups) {
    // Sort newest first by created_at
    group.sort((a, b) => {
      const ta = a.created_at?.toMillis?.() ?? new Date(a.created_at ?? 0).getTime();
      const tb = b.created_at?.toMillis?.() ?? new Date(b.created_at ?? 0).getTime();
      return tb - ta;
    });

    const [keep, ...dupes] = group;
    console.log(
      `  ${keep.business_name ?? keep.lead_id} (step ${keep.step_number ?? 1}) — keeping ${keep.id}, deleting ${dupes.map((d) => d.id).join(", ")}`
    );
    toDelete.push(...dupes.map((d) => d.id));
  }

  console.log(`\nWill delete ${toDelete.length} duplicate(s)`);

  if (DRY_RUN) {
    console.log("\nDry run complete. Re-run without --dry-run to apply.");
    return;
  }

  // Delete in batches of 490
  for (let i = 0; i < toDelete.length; i += 490) {
    const batch = db.batch();
    for (const id of toDelete.slice(i, i + 490)) {
      batch.delete(db.collection("outreach_messages").doc(id));
    }
    await batch.commit();
  }

  console.log(`\nDone. Deleted ${toDelete.length} duplicate draft(s).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
