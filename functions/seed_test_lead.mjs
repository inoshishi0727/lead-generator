import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "crypto";

initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore();

const leadId = randomUUID();
const msgId = randomUUID();
const now = new Date().toISOString();

await db.collection("leads").doc(leadId).set({
  id: leadId,
  source: "manual",
  business_name: "Absolution Labs Test Bar",
  address: "123 Test Street, London SE1 1AA",
  email: "chantal@absolutionlabs.com",
  email_found: true,
  contact_name: "Chantal",
  contact_email: "chantal@absolutionlabs.com",
  contact_role: "Owner",
  contact_confidence: "verified",
  stage: "sent",
  score: 75,
  category: "cocktail_bar",
  enrichment: {
    venue_category: "cocktail_bar",
    tone_tier: "bartender_casual",
    menu_fit: "strong",
    lead_products: ["Schofield's", "Dispense"],
    business_summary: "A test cocktail bar for reply tracking",
    context_notes: "Test lead for reply tracking flow",
  },
  scraped_at: now,
  updated_at: now,
});

await db.collection("outreach_messages").doc(msgId).set({
  id: msgId,
  lead_id: leadId,
  business_name: "Absolution Labs Test Bar",
  venue_category: "cocktail_bar",
  channel: "email",
  subject: "English Vermouth for the cocktail menu",
  content: "Hi Chantal,\n\nWe're Asterley Bros, makers of English Vermouth and Amaro in SE26. I'd love you to try our Schofield's Dry Vermouth and see what you think.\n\nCan I pop in one afternoon with some samples?\n\nSchofield's was created with bartenders Joe and Daniel Schofield. Crisp, herbaceous, distinctly British. Designed for the ultimate Martini (and a banging White Negroni too!).\n\nWhen's a good time to catch you?\n\nCheers,",
  status: "sent",
  step_number: 1,
  created_at: now,
  sent_at: now,
  tone_tier: "bartender_casual",
  lead_products: ["Schofield's", "Dispense"],
  contact_name: "Chantal",
  context_notes: "Test lead for reply tracking flow",
  menu_fit: "strong",
  recipient_email: "chantal@absolutionlabs.com",
  website: null,
  original_content: null,
  original_subject: null,
  was_edited: false,
});

console.log("Test data created!");
console.log("Lead ID:", leadId);
console.log("Message ID:", msgId);
process.exit(0);
