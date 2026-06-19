import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

async function main() {
  const snap = await db.collection("outreach_messages")
    .where("status", "==", "sent")
    .where("channel", "==", "email")
    .get();

  let total = snap.size;
  let withSegment = 0;
  let withFeatures = 0;
  let eligible = 0;
  const segCounts = new Map();

  for (const doc of snap.docs) {
    const m = doc.data();
    if (m.segment_key) withSegment += 1;
    if (m.subject_features || m.content_features) withFeatures += 1;
    if (m.segment_key && (m.subject_features || m.content_features)) {
      eligible += 1;
      segCounts.set(m.segment_key, (segCounts.get(m.segment_key) || 0) + 1);
    }
  }

  console.log(`Total sent emails: ${total}`);
  console.log(`With segment_key: ${withSegment}`);
  console.log(`With features: ${withFeatures}`);
  console.log(`Eligible (segment + features): ${eligible}`);
  console.log(`\nSegments breakdown:`);
  const sorted = [...segCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, n] of sorted) console.log(`  ${k}: ${n}`);

  const stats = await db.collection("outreach_stats").get();
  console.log(`\noutreach_stats docs written: ${stats.size}`);
  for (const d of stats.docs) console.log(`  ${d.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
