import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

async function main() {
  // Find drafts matching "English Amaro for Spring menus"
  const snap = await db.collection("outreach_messages")
    .where("subject", "==", "English Amaro for Spring menus")
    .limit(20)
    .get();

  console.log(`Drafts with that subject: ${snap.size}\n`);

  const segCounts = new Map();
  for (const d of snap.docs) {
    const m = d.data();
    console.log(`id=${d.id}  status=${m.status}  segment_key=${m.segment_key || "(none)"}  broad=${m.broad_segment_key || "(none)"}`);
    if (m.segment_key) segCounts.set(m.segment_key, (segCounts.get(m.segment_key) || 0) + 1);
  }

  // Cross-check sent emails by segment
  console.log(`\n--- Sent emails per segment_key ---`);
  const sentSnap = await db.collection("outreach_messages")
    .where("status", "==", "sent")
    .where("channel", "==", "email")
    .get();
  const sentSeg = new Map();
  const sentBroad = new Map();
  for (const d of sentSnap.docs) {
    const m = d.data();
    if (m.segment_key) sentSeg.set(m.segment_key, (sentSeg.get(m.segment_key) || 0) + 1);
    if (m.broad_segment_key) sentBroad.set(m.broad_segment_key, (sentBroad.get(m.broad_segment_key) || 0) + 1);
  }

  console.log(`\nNarrow segments (cat|tone|city):`);
  [...sentSeg.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k}: ${n}`));
  console.log(`\nBroad segments (cat|tone):`);
  [...sentBroad.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k}: ${n}`));

  // Stats docs
  const stats = await db.collection("outreach_stats").get();
  console.log(`\n--- outreach_stats docs: ${stats.size} ---`);
  for (const s of stats.docs) console.log(`  ${s.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
