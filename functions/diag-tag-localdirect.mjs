// READ-ONLY. Inspect the tag catalog + every lead carrying "local-direct".
// Usage: node diag-tag-localdirect.mjs
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

const idx = await db.collection("tag_index").doc("counts").get();
const counts = idx.exists ? idx.data() : {};
console.log("=== tag_index/counts ===");
for (const [t, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${n}`);
}

const snap = await db.collection("leads").where("tags", "array-contains", "local-direct").get();
console.log(`\n=== leads with "local-direct": ${snap.size} ===`);
for (const d of snap.docs) {
  const l = d.data();
  console.log(`  ${d.id} | ${l.business_name || "?"} | addr=${(l.address || "").slice(0, 40)} | tags=${JSON.stringify(l.tags)}`);
}
process.exit(0);
