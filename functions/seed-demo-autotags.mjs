// Seed clearly-labelled TEST leads that trigger each reply/outcome-based
// auto-tag (hot, warm, not_interested, revisit) so the full tag set is visible
// in the UI without waiting for real inbound replies. Uses ADC.
//
// Usage:  node seed-demo-autotags.mjs           (create + tag)
//         node seed-demo-autotags.mjs --remove   (delete the test leads)
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);
const REMOVE = process.argv.includes("--remove");

const now = new Date().toISOString();
const nextDec = `${new Date().getFullYear()}-12`; // a month >= current

// Each demo lead + the message signal that should produce its auto-tag.
const DEMO = [
  { id: "demo-autotag-hot",  name: "ZZ TEST — Hot Lead",  stage: "responded", reply_count: 1, open_count: 2,
    msg: { content_rating: "great", content_rated_at: now, sent_at: now }, expect: ["hot"] },
  { id: "demo-autotag-warm", name: "ZZ TEST — Warm Lead", stage: "responded", reply_count: 1, open_count: 2,
    msg: { content_rating: "good", content_rated_at: now, sent_at: now }, expect: ["warm"] },
  { id: "demo-autotag-noint", name: "ZZ TEST — Not Interested", stage: "declined", outcome: "not_interested",
    reply_count: 1, open_count: 1, msg: { content_rating: "not_interested", content_rated_at: now, sent_at: now }, expect: ["not_interested"] },
  { id: "demo-autotag-revisit", name: "ZZ TEST — Revisit December", stage: "responded", reply_count: 1, open_count: 1,
    msg: { content_rating: "good", content_rated_at: now, sent_at: now, revisit_month: nextDec }, expect: ["warm", `revisit:${nextDec}`] },
];

async function remove() {
  for (const d of DEMO) {
    await db.collection("leads").doc(d.id).delete().catch(() => {});
    const ms = await db.collection("outreach_messages").where("lead_id", "==", d.id).get();
    for (const m of ms.docs) await m.ref.delete();
  }
  console.log(`Removed ${DEMO.length} demo leads + their messages.`);
}

async function seed() {
  for (const d of DEMO) {
    await db.collection("leads").doc(d.id).set({
      id: d.id,
      business_name: d.name,
      email: `${d.id}@example.com`,
      email_found: true,
      source: "manual",
      stage: d.stage,
      outcome: d.outcome ?? "ongoing",
      reply_count: d.reply_count ?? 0,
      open_count: d.open_count ?? 0,
      scraped_at: now,
      created_at: now,
      auto_tags: d.expect.slice().sort(),
      auto_tags_updated_at: now,
    }, { merge: true });

    const msgId = `${d.id}-msg`;
    await db.collection("outreach_messages").doc(msgId).set({
      id: msgId,
      lead_id: d.id,
      business_name: d.name,
      channel: "email",
      status: "sent",
      step_number: 1,
      content: "demo",
      created_at: now,
      ...d.msg,
    }, { merge: true });

    console.log(`  ${d.name.padEnd(28)} → ${d.expect.join(", ")}`);
  }
  console.log(`\nSeeded ${DEMO.length} demo leads. Remove later with: node seed-demo-autotags.mjs --remove`);
}

(REMOVE ? remove() : seed()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
