import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

console.log("=== Checking webhook_events for lead_ingestion ===\n");

const webhookSnap = await db.collection("webhook_events")
  .where("event_type", "==", "lead_ingestion")
  .orderBy("processed_at", "desc")
  .limit(20)
  .get();

if (webhookSnap.empty) {
  console.log("No lead_ingestion webhook events found at all.");
} else {
  console.log(`Found ${webhookSnap.size} lead_ingestion events:\n`);
  for (const doc of webhookSnap.docs) {
    const d = doc.data();
    console.log(`  ID: ${doc.id}`);
    console.log(`  Status: ${d.status}`);
    console.log(`  Processed: ${d.processed_at}`);
    console.log(`  Reason: ${d.reason || "N/A"}`);
    console.log(`  Resend email ID: ${d.resend_email_id}`);
    console.log("");
  }
}

console.log("\n=== Checking activity_log for lead_ingested_via_email ===\n");

const activitySnap = await db.collection("activity_log")
  .where("type", "==", "lead_ingested_via_email")
  .orderBy("created_at", "desc")
  .limit(20)
  .get();

if (activitySnap.empty) {
  console.log("No lead_ingested_via_email activity log entries found.");
} else {
  console.log(`Found ${activitySnap.size} ingestion records:\n`);
  for (const doc of activitySnap.docs) {
    const d = doc.data();
    console.log(`  Business: ${d.business_name}`);
    console.log(`  Lead ID: ${d.lead_id}`);
    console.log(`  From: ${d.from_email}`);
    console.log(`  Created: ${d.created_at}`);
    console.log("");
  }
}

console.log("\n=== Checking leads with source=email_ingestion ===\n");

const leadsSnap = await db.collection("leads")
  .where("source", "==", "email_ingestion")
  .get();

if (leadsSnap.empty) {
  console.log("No leads with source=email_ingestion found.");
} else {
  console.log(`Found ${leadsSnap.size} email-ingested leads:\n`);
  for (const doc of leadsSnap.docs) {
    const d = doc.data();
    console.log(`  "${d.business_name}" — website: ${d.website || "none"} — stage: ${d.stage || "?"} — scraped_at: ${d.scraped_at || "?"}`);
  }
}
