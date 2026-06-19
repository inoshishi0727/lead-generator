import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  extractSubjectFeatures,
  extractContentFeatures,
  buildSegmentKey,
  buildBroadSegmentKey,
} from "./feature-extractor.js";

const DRY_RUN = process.argv.includes("--dry-run");

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

async function main() {
  console.log(DRY_RUN ? "DRY RUN\n" : "LIVE BACKFILL\n");

  const snap = await db.collection("outreach_messages")
    .where("channel", "==", "email")
    .get();

  console.log(`Email messages (all statuses): ${snap.size}`);

  const leadCache = new Map();
  async function getLead(leadId) {
    if (!leadId) return null;
    if (leadCache.has(leadId)) return leadCache.get(leadId);
    const ld = await db.collection("leads").doc(leadId).get();
    const data = ld.exists ? ld.data() : null;
    leadCache.set(leadId, data);
    return data;
  }

  let updated = 0;
  let skippedNoLead = 0;
  let alreadyTagged = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const m = doc.data();
    if (m.segment_key && (m.subject_features || m.content_features)) {
      alreadyTagged += 1;
      continue;
    }

    const lead = await getLead(m.lead_id);
    if (!lead) { skippedNoLead += 1; continue; }

    const enrichment = lead.enrichment || {};
    const update = {
      subject_features: extractSubjectFeatures(m.subject),
      content_features: extractContentFeatures(m.content),
      segment_key: buildSegmentKey(lead, enrichment),
      broad_segment_key: buildBroadSegmentKey(lead, enrichment),
    };

    if (!DRY_RUN) {
      batch.update(doc.ref, update);
      batchCount += 1;
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    updated += 1;
  }

  if (!DRY_RUN && batchCount > 0) await batch.commit();

  console.log(`Updated: ${updated}`);
  console.log(`Already tagged: ${alreadyTagged}`);
  console.log(`Skipped (no lead doc): ${skippedNoLead}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
