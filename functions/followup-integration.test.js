/**
 * Integration tests for follow-up logic against Firestore emulator.
 *
 * Prerequisites:
 *   firebase emulators:start --only firestore
 *
 * Run:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --test followup-integration.test.js
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  FOLLOW_UP_LABELS,
  FOLLOW_UP_GAP_DAYS,
  shouldSkipLead,
  determineFollowUpAction,
  shouldGenerateEscalationDm,
} from "./followup-logic.js";

// ---- Emulator setup ----

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set. Run:\n  firebase emulators:start --only firestore");
  process.exit(1);
}

const app = getApps().length === 0
  ? initializeApp({ projectId: "test-followups" })
  : getApps()[0];
const db = getFirestore(app);

// ---- Helpers ----

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function clearCollection(name) {
  const snap = await db.collection(name).get();
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  if (snap.docs.length > 0) await batch.commit();
}

async function seedLead(id, overrides = {}) {
  const lead = {
    business_name: "Test Bar",
    email: "test@bar.com",
    stage: "sent",
    client_status: null,
    human_takeover: false,
    category: "cocktail_bar",
    instagram_handle: null,
    enrichment: {
      venue_category: "cocktail_bar",
      tone_tier: "bartender_casual",
      context_notes: "Great cocktail bar",
      lead_products: ["Dispense"],
    },
    ...overrides,
  };
  await db.collection("leads").doc(id).set(lead);
  return { id, ...lead };
}

async function seedMessage(id, leadId, stepNumber, status, sentDaysAgo, overrides = {}) {
  const msg = {
    id,
    lead_id: leadId,
    business_name: "Test Bar",
    channel: "email",
    subject: `Test Subject Step ${stepNumber}`,
    content: "Test content",
    status,
    step_number: stepNumber,
    follow_up_label: FOLLOW_UP_LABELS[stepNumber],
    scheduled_send_date: null,
    created_at: daysAgo(sentDaysAgo),
    sent_at: status === "sent" ? daysAgo(sentDaysAgo) : null,
    tone_tier: "bartender_casual",
    lead_products: ["Dispense"],
    contact_name: null,
    recipient_email: "test@bar.com",
    opened: false,
    is_channel_escalation: false,
    ...overrides,
  };
  await db.collection("outreach_messages").doc(id).set(msg);
  return msg;
}

async function seedReply(id, leadId) {
  await db.collection("inbound_replies").doc(id).set({
    lead_id: leadId,
    matched: true,
    from_email: "bar@test.com",
    body: "Thanks for reaching out",
    source: "resend",
    direction: "inbound",
    created_at: new Date().toISOString(),
  });
}

/**
 * Simulates the core generateFollowups loop for a single lead
 * using the extracted pure logic + Firestore reads/writes.
 * (Skips the Claude API call — we're testing scheduling, not email generation.)
 */
async function runFollowUpForLead(leadId) {
  const leadSnap = await db.collection("leads").doc(leadId).get();
  if (!leadSnap.exists) return { action: "skip", reason: "lead_not_found" };
  const lead = { id: leadSnap.id, ...leadSnap.data() };

  // Check replies
  const repliesSnap = await db.collection("inbound_replies")
    .where("lead_id", "==", leadId)
    .where("matched", "==", true)
    .get();
  const hasReply = !repliesSnap.empty;

  const skipReason = shouldSkipLead(lead, hasReply);
  if (skipReason) return { action: "skip", reason: skipReason };

  // Get messages
  const msgsSnap = await db.collection("outreach_messages")
    .where("lead_id", "==", leadId)
    .get();
  const messages = msgsSnap.docs
    .map((d) => d.data())
    .sort((a, b) => (b.sent_at || b.created_at || "").localeCompare(a.sent_at || a.created_at || ""));

  const result = determineFollowUpAction(messages, new Date());

  if (result.action === "complete") {
    await db.collection("leads").doc(leadId).update({ stage: "no_response" });
    return result;
  }

  if (result.action === "generate") {
    // Write the draft (without calling Claude — just a placeholder)
    const msgId = `followup-${result.nextStepNumber}-${Date.now()}`;
    await db.collection("outreach_messages").doc(msgId).set({
      id: msgId,
      lead_id: leadId,
      business_name: lead.business_name,
      channel: "email",
      subject: `Follow-up ${result.nextStepNumber}`,
      content: "[draft content placeholder]",
      status: "draft",
      step_number: result.nextStepNumber,
      follow_up_label: result.followUpLabel,
      scheduled_send_date: result.scheduledSendDate,
      created_at: new Date().toISOString(),
      sent_at: null,
      opened: false,
      is_channel_escalation: false,
    });

    if (result.newStage && result.newStage !== lead.stage) {
      await db.collection("leads").doc(leadId).update({ stage: result.newStage });
    }
  }

  return result;
}

/**
 * Check if an escalation DM should be created for this lead.
 * This simulates the escalation phase of generateFollowups.
 */
async function checkEscalation(leadId) {
  const msgsSnap = await db.collection("outreach_messages")
    .where("lead_id", "==", leadId)
    .get();
  const messages = msgsSnap.docs.map((d) => d.data());

  return shouldGenerateEscalationDm(messages, new Date());
}

// ---- Tests ----

describe("Firestore integration: follow-up generation", () => {
  beforeEach(async () => {
    await clearCollection("leads");
    await clearCollection("outreach_messages");
    await clearCollection("inbound_replies");
  });

  it("generates 1st follow up draft when initial was sent 4 days ago", async () => {
    await seedLead("lead-1");
    await seedMessage("msg-1", "lead-1", 1, "sent", 4);

    const result = await runFollowUpForLead("lead-1");

    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "1st follow up");
    assert.equal(result.nextStepNumber, 2);

    // Verify draft was written to Firestore
    const msgsSnap = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .where("step_number", "==", 2)
      .get();
    assert.equal(msgsSnap.size, 1);
    const draft = msgsSnap.docs[0].data();
    assert.equal(draft.status, "draft");
    assert.equal(draft.follow_up_label, "1st follow up");
    assert.ok(draft.scheduled_send_date);

    // Verify lead stage updated
    const leadSnap = await db.collection("leads").doc("lead-1").get();
    assert.equal(leadSnap.data().stage, "follow_up_1");
  });

  it("skips if initial was sent only 2 days ago", async () => {
    await seedLead("lead-1");
    await seedMessage("msg-1", "lead-1", 1, "sent", 2);

    const result = await runFollowUpForLead("lead-1");

    assert.equal(result.action, "skip");
    assert.equal(result.reason, "too_early");

    // No new drafts
    const msgsSnap = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .get();
    assert.equal(msgsSnap.size, 1); // only the original
  });

  it("stops when lead has inbound reply", async () => {
    await seedLead("lead-1");
    await seedMessage("msg-1", "lead-1", 1, "sent", 8);
    await seedReply("reply-1", "lead-1");

    const result = await runFollowUpForLead("lead-1");

    assert.equal(result.action, "skip");
    assert.equal(result.reason, "has_reply");
  });

  it("stops when lead is snoozed", async () => {
    await seedLead("lead-1", { client_status: "snoozed" });
    await seedMessage("msg-1", "lead-1", 1, "sent", 8);

    const result = await runFollowUpForLead("lead-1");
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "snoozed");
  });

  it("stops when lead has human_takeover", async () => {
    await seedLead("lead-1", { human_takeover: true });
    await seedMessage("msg-1", "lead-1", 1, "sent", 8);

    const result = await runFollowUpForLead("lead-1");
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "human_takeover");
  });

  it("skips if a draft already exists for the next step", async () => {
    await seedLead("lead-1");
    await seedMessage("msg-1", "lead-1", 1, "sent", 8);
    await seedMessage("msg-2", "lead-1", 2, "draft", 0);

    const result = await runFollowUpForLead("lead-1");
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "draft_exists");
  });

  it("moves lead to no_response after all 5 steps exhausted", async () => {
    await seedLead("lead-1");
    await seedMessage("msg-1", "lead-1", 1, "sent", 104);
    await seedMessage("msg-2", "lead-1", 2, "sent", 100);
    await seedMessage("msg-3", "lead-1", 3, "sent", 96);
    await seedMessage("msg-4", "lead-1", 4, "sent", 92);
    await seedMessage("msg-5", "lead-1", 5, "sent", 1);

    const result = await runFollowUpForLead("lead-1");
    assert.equal(result.action, "complete");
    assert.equal(result.newStage, "no_response");

    const leadSnap = await db.collection("leads").doc("lead-1").get();
    assert.equal(leadSnap.data().stage, "no_response");
  });

  it("walks through the full 5-step sequence progressively with 4-day gaps", async () => {
    // Step 1: initial sent 13 days ago
    await seedLead("lead-1");
    await seedMessage("msg-1", "lead-1", 1, "sent", 13);

    // Generate 1st follow up (due at day 4, draft at day 3, so day 10 from now)
    let result = await runFollowUpForLead("lead-1");
    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "1st follow up");

    // Simulate: approve + send the 1st follow up (sent 9 days ago = day 4 from initial)
    const step2Snap = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .where("step_number", "==", 2)
      .get();
    await step2Snap.docs[0].ref.update({ status: "sent", sent_at: daysAgo(9) });

    // Generate 2nd follow up (due at day 8, draft at day 7)
    result = await runFollowUpForLead("lead-1");
    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "2nd follow up");

    // Simulate: send the 2nd follow up (sent 5 days ago = day 8 from initial)
    const step3Snap = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .where("step_number", "==", 3)
      .get();
    await step3Snap.docs[0].ref.update({ status: "sent", sent_at: daysAgo(5) });

    // Generate 3rd follow up (due at day 12, draft at day 11)
    result = await runFollowUpForLead("lead-1");
    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "3rd follow up");

    // Simulate: send the 3rd follow up (sent 1 day ago = day 12 from initial)
    const step4Snap = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .where("step_number", "==", 4)
      .get();
    await step4Snap.docs[0].ref.update({ status: "sent", sent_at: daysAgo(1) });

    // Too early for re-engagement (step 5 due at day 102)
    result = await runFollowUpForLead("lead-1");
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "too_early");

    // Verify final state has 4 messages
    const allMsgs = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .get();
    assert.equal(allMsgs.size, 4); // initial + 3 follow ups
  });

  it("mid-sequence reply stops further follow ups", async () => {
    await seedLead("lead-1");
    await seedMessage("msg-1", "lead-1", 1, "sent", 9);
    await seedMessage("msg-2", "lead-1", 2, "sent", 5);

    // Reply comes in after 1st follow up
    await seedReply("reply-1", "lead-1");

    const result = await runFollowUpForLead("lead-1");
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "has_reply");

    // No 2nd follow up draft created
    const msgsSnap = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .where("step_number", "==", 3)
      .get();
    assert.equal(msgsSnap.size, 0);
  });

  it("triggers escalation DM when step 2 email unopened 3+ days", async () => {
    await seedLead("lead-1", { instagram_handle: "@testbar_london" });
    await seedMessage("msg-1", "lead-1", 1, "sent", 9);
    await seedMessage("msg-2", "lead-1", 2, "sent", 5, {
      opened: false,
      channel: "email",
    });

    const messages = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .get();
    const messagesList = messages.docs.map((d) => d.data());

    // Check if escalation should be triggered
    const shouldEscalate = shouldGenerateEscalationDm(messagesList, new Date());
    assert.equal(shouldEscalate, true);
  });

  it("does not trigger escalation when step 2 email was opened", async () => {
    await seedLead("lead-1", { instagram_handle: "@testbar_london" });
    await seedMessage("msg-1", "lead-1", 1, "sent", 9);
    await seedMessage("msg-2", "lead-1", 2, "sent", 5, {
      opened: true,
      channel: "email",
    });

    const messages = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .get();
    const messagesList = messages.docs.map((d) => d.data());

    // Check if escalation should be triggered
    const shouldEscalate = shouldGenerateEscalationDm(messagesList, new Date());
    assert.equal(shouldEscalate, false);
  });

  it("does not trigger escalation when step 2 less than 3 days old", async () => {
    await seedLead("lead-1", { instagram_handle: "@testbar_london" });
    await seedMessage("msg-1", "lead-1", 1, "sent", 7);
    await seedMessage("msg-2", "lead-1", 2, "sent", 2, {
      opened: false,
      channel: "email",
    });

    const messages = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .get();
    const messagesList = messages.docs.map((d) => d.data());

    // Check if escalation should be triggered (should be false - too early)
    const shouldEscalate = shouldGenerateEscalationDm(messagesList, new Date());
    assert.equal(shouldEscalate, false);
  });

  it("does not trigger escalation when DM already exists", async () => {
    await seedLead("lead-1", { instagram_handle: "@testbar_london" });
    await seedMessage("msg-1", "lead-1", 1, "sent", 9);
    await seedMessage("msg-2", "lead-1", 2, "sent", 5, {
      opened: false,
      channel: "email",
    });
    // Existing escalation DM
    await seedMessage("msg-3", "lead-1", 2, "planned", 0, {
      channel: "instagram_dm",
      is_channel_escalation: true,
      subject: null,
    });

    const messages = await db.collection("outreach_messages")
      .where("lead_id", "==", "lead-1")
      .get();
    const messagesList = messages.docs.map((d) => d.data());

    // Check if escalation should be triggered (should be false - already exists)
    const shouldEscalate = shouldGenerateEscalationDm(messagesList, new Date());
    assert.equal(shouldEscalate, false);
  });
});
