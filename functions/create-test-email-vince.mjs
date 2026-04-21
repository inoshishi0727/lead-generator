import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

const leadId = crypto.randomUUID();
const msgId = crypto.randomUUID();
const now = new Date().toISOString();

await db.collection("leads").doc(leadId).set({
  id: leadId,
  business_name: "Vince Test Venue",
  email: "cortezvince998@gmail.com",
  email_found: true,
  source: "manual",
  stage: "draft_generated",
  client_status: null,
  category: "test",
  address: "London",
  website: null,
  phone: null,
  score: null,
  enrichment_status: null,
  scraped_at: now,
  updated_at: now,
});

await db.collection("outreach_messages").doc(msgId).set({
  id: msgId,
  lead_id: leadId,
  business_name: "Vince Test Venue",
  channel: "email",
  subject: "Asterley Bros — test outreach",
  content: `Hi Vince,\n\nThis is a test email from the Asterley Bros outreach system.\n\nIf you received this, the send pipeline is working correctly.\n\nBest,\nThe Asterley Bros team`,
  status: "approved",
  step_number: 1,
  created_at: now,
  recipient_email: "cortezvince998@gmail.com",
  original_content: "test",
  original_subject: "Asterley Bros — test outreach",
  was_edited: false,
  lead_products: [],
  venue_category: null,
  tone_tier: null,
  contact_name: "Vince",
  context_notes: null,
  menu_fit: null,
  website: null,
});

console.log("Created lead:", leadId);
console.log("Created message:", msgId);
console.log("Recipient: cortezvince998@gmail.com");
console.log("Status: approved — go to Outreach > Approved and hit Send");
