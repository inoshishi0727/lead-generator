import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

const leadId = crypto.randomUUID();
const msgId = crypto.randomUUID();
const now = new Date().toISOString();

// Create test lead
await db.collection("leads").doc(leadId).set({
  id: leadId,
  business_name: "Absolution Labs (TEST)",
  email: "chantal@absolutionlabs.com",
  email_found: true,
  source: "manual",
  stage: "draft_generated",
  client_status: "approved",
  category: "test",
  address: "London",
  website: null,
  phone: null,
  score: null,
  enrichment_status: null,
  scraped_at: now,
  updated_at: now,
});

// Create test draft (approved, ready to send)
await db.collection("outreach_messages").doc(msgId).set({
  id: msgId,
  lead_id: leadId,
  business_name: "Absolution Labs (TEST)",
  channel: "email",
  subject: "Test",
  content: "test",
  status: "approved",
  step_number: 1,
  created_at: now,
  recipient_email: "chantal@absolutionlabs.com",
  workspace_id: "",
  original_content: "test",
  original_subject: "Test",
  was_edited: false,
  lead_products: [],
  venue_category: null,
  tone_tier: null,
  contact_name: "Chantal",
  context_notes: null,
  menu_fit: null,
  website: null,
});

console.log("Created lead:", leadId);
console.log("Created message:", msgId);
console.log("Status: approved — ready to send from the Outreach page");
