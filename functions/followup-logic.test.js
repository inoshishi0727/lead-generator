import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FOLLOW_UP_LABELS,
  FOLLOW_UP_GAP_DAYS,
  shouldSkipLead,
  determineFollowUpAction,
} from "./followup-logic.js";

// ---- Helpers ----

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function makeLead(overrides = {}) {
  return {
    id: "lead-1",
    business_name: "Test Bar",
    stage: "sent",
    client_status: null,
    human_takeover: false,
    ...overrides,
  };
}

function makeMessage(stepNumber, status, sentDaysAgo, overrides = {}) {
  return {
    id: `msg-step-${stepNumber}`,
    lead_id: "lead-1",
    step_number: stepNumber,
    status,
    sent_at: status === "sent" ? daysAgo(sentDaysAgo) : null,
    created_at: daysAgo(sentDaysAgo),
    follow_up_label: FOLLOW_UP_LABELS[stepNumber],
    ...overrides,
  };
}

// ---- Constants ----

describe("FOLLOW_UP_LABELS", () => {
  it("maps step numbers to correct labels", () => {
    assert.equal(FOLLOW_UP_LABELS[1], "initial");
    assert.equal(FOLLOW_UP_LABELS[2], "1st follow up");
    assert.equal(FOLLOW_UP_LABELS[3], "2nd follow up");
    assert.equal(FOLLOW_UP_LABELS[4], "3rd follow up");
  });
});

describe("FOLLOW_UP_GAP_DAYS", () => {
  it("has correct timing gaps", () => {
    assert.equal(FOLLOW_UP_GAP_DAYS[2], 7);
    assert.equal(FOLLOW_UP_GAP_DAYS[3], 14);
    assert.equal(FOLLOW_UP_GAP_DAYS[4], 18);
  });
});

// ---- shouldSkipLead ----

describe("shouldSkipLead", () => {
  it("skips lead with inbound reply", () => {
    assert.equal(shouldSkipLead(makeLead(), true), "has_reply");
  });

  it("skips lead in terminal stage: responded", () => {
    assert.equal(shouldSkipLead(makeLead({ stage: "responded" }), false), "terminal_stage");
  });

  it("skips lead in terminal stage: converted", () => {
    assert.equal(shouldSkipLead(makeLead({ stage: "converted" }), false), "terminal_stage");
  });

  it("skips lead in terminal stage: declined", () => {
    assert.equal(shouldSkipLead(makeLead({ stage: "declined" }), false), "terminal_stage");
  });

  it("skips snoozed lead", () => {
    assert.equal(shouldSkipLead(makeLead({ client_status: "snoozed" }), false), "snoozed");
  });

  it("skips current_account lead", () => {
    assert.equal(shouldSkipLead(makeLead({ client_status: "current_account" }), false), "current_account");
  });

  it("skips in_discussion lead", () => {
    assert.equal(shouldSkipLead(makeLead({ client_status: "in_discussion" }), false), "in_discussion");
  });

  it("skips human_takeover lead", () => {
    assert.equal(shouldSkipLead(makeLead({ human_takeover: true }), false), "human_takeover");
  });

  it("returns null for eligible lead", () => {
    assert.equal(shouldSkipLead(makeLead(), false), null);
  });

  it("returns null for follow_up_1 stage lead without replies", () => {
    assert.equal(shouldSkipLead(makeLead({ stage: "follow_up_1" }), false), null);
  });
});

// ---- determineFollowUpAction ----

describe("determineFollowUpAction", () => {
  it("skips when no sent messages exist", () => {
    const messages = [makeMessage(1, "draft", 3)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "no_sent_message");
  });

  it("generates 1st follow up after 6+ days (draft 1 day early)", () => {
    const messages = [makeMessage(1, "sent", 6)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 2);
    assert.equal(result.followUpLabel, "1st follow up");
    assert.equal(result.newStage, "follow_up_1");
  });

  it("skips 1st follow up if only 3 days since initial send", () => {
    const messages = [makeMessage(1, "sent", 3)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "too_early");
  });

  it("generates 2nd follow up after 13+ days from initial", () => {
    const messages = [
      makeMessage(1, "sent", 14),
      makeMessage(2, "sent", 7),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 3);
    assert.equal(result.followUpLabel, "2nd follow up");
    assert.equal(result.newStage, "follow_up_2");
  });

  it("generates 3rd follow up after 17+ days from initial", () => {
    const messages = [
      makeMessage(1, "sent", 18),
      makeMessage(2, "sent", 11),
      makeMessage(3, "sent", 4),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 4);
    assert.equal(result.followUpLabel, "3rd follow up");
    assert.equal(result.newStage, "follow_up_2");
  });

  it("completes sequence after all 4 steps sent", () => {
    const messages = [
      makeMessage(1, "sent", 20),
      makeMessage(2, "sent", 13),
      makeMessage(3, "sent", 6),
      makeMessage(4, "sent", 2),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "complete");
    assert.equal(result.newStage, "no_response");
  });

  it("skips if draft already exists for next step", () => {
    const messages = [
      makeMessage(1, "sent", 8),
      makeMessage(2, "draft", 0),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "draft_exists");
  });

  it("skips if approved message exists for next step", () => {
    const messages = [
      makeMessage(1, "sent", 8),
      makeMessage(2, "approved", 0),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "draft_exists");
  });

  it("returns correct scheduled_send_date format (YYYY-MM-DD)", () => {
    const messages = [makeMessage(1, "sent", 7)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.match(result.scheduledSendDate, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("calculates timing from initial send, not latest send", () => {
    // Initial sent 15 days ago, step 3 sent 3 days ago
    // Step 4 due at day 18 from initial = 3 days from now
    // Draft generated at day 17 = 2 days from now → too early
    const messages = [
      makeMessage(1, "sent", 15),
      makeMessage(2, "sent", 8),
      makeMessage(3, "sent", 3),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "too_early");
  });

  it("generates step 4 when initial sent 17+ days ago", () => {
    // Initial sent 17 days ago → step 4 due day 18, draft at day 17 = today
    const messages = [
      makeMessage(1, "sent", 17),
      makeMessage(2, "sent", 10),
      makeMessage(3, "sent", 3),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 4);
  });

  it("uses last sent date as fallback when no step 1 found", () => {
    // Edge case: step 1 message missing, only step 2 exists as sent
    const messages = [
      makeMessage(2, "sent", 8),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "too_early");
    // step 3 due 14 days from step 2 sent, so 6 more days
  });
});

// ---- Timing edge cases ----

describe("timing edge cases", () => {
  it("day 5: too early for 1st follow up", () => {
    const messages = [makeMessage(1, "sent", 5)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "too_early");
  });

  it("day 6: exactly 1 day before due date, should generate", () => {
    const messages = [makeMessage(1, "sent", 6)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 2);
  });

  it("day 7: on due date, should generate", () => {
    const messages = [makeMessage(1, "sent", 7)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 2);
  });

  it("day 10: overdue but still generates", () => {
    const messages = [makeMessage(1, "sent", 10)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 2);
  });
});

// ---- Full sequence simulation ----

describe("full sequence simulation", () => {
  it("walks through entire 4-step sequence", () => {
    const now = new Date();

    // Day 0: initial sent
    let messages = [makeMessage(1, "sent", 18)];

    // Day 6: generate 1st follow up
    let result = determineFollowUpAction(messages, now);
    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "1st follow up");

    // Simulate: 1st follow up was sent
    messages.push(makeMessage(2, "sent", 11));

    // Day 13: generate 2nd follow up
    result = determineFollowUpAction(messages, now);
    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "2nd follow up");

    // Simulate: 2nd follow up was sent
    messages.push(makeMessage(3, "sent", 4));

    // Day 17: generate 3rd follow up
    result = determineFollowUpAction(messages, now);
    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "3rd follow up");

    // Simulate: 3rd follow up was sent
    messages.push(makeMessage(4, "sent", 1));

    // Sequence complete
    result = determineFollowUpAction(messages, now);
    assert.equal(result.action, "complete");
    assert.equal(result.newStage, "no_response");
  });
});
