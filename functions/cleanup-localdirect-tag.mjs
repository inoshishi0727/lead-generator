// One-time: strip the bogus "local-direct" tag from every lead carrying it.
// The deployed onLeadWrite_updateTagIndex trigger decrements tag_index/counts
// to 0, and useTagIndex filters count>0, so the tag drops out of the UI catalog
// automatically. Nothing is added in its place.
//
// Usage: node cleanup-localdirect-tag.mjs --dry-run   (preview)
//        node cleanup-localdirect-tag.mjs             (write)
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const app = getApps().length ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);
const DRY = process.argv.includes("--dry-run");
const TAG = "local-direct";

const snap = await db.collection("leads").where("tags", "array-contains", TAG).get();
console.log(`${DRY ? "[DRY] " : ""}leads with "${TAG}": ${snap.size}`);

for (const d of snap.docs) {
  const l = d.data();
  const next = (l.tags || []).filter((t) => t !== TAG);
  console.log(`  ${d.id} | ${l.business_name || "?"} | ${JSON.stringify(l.tags)} -> ${JSON.stringify(next)}`);
  if (!DRY) {
    await d.ref.update({ tags: FieldValue.arrayRemove(TAG), updated_at: new Date().toISOString() });
  }
}
console.log(DRY ? "\n[DRY] no writes." : "\nDone. tag_index zeroes via trigger; UI filters count>0.");
process.exit(0);
