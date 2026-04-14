import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FOLLOW_UP_LABELS,
  FOLLOW_UP_GAP_DAYS,
  shouldSkipLead,
  determineFollowUpAction,
  shouldGenerateEscalationDm,
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
    assert.equal(FOLLOW_UP_LABELS[5], "re-engagement");
  });
});

describe("FOLLOW_UP_GAP_DAYS", () => {
  it("has correct timing gaps (4-day spacing)", () => {
    assert.equal(FOLLOW_UP_GAP_DAYS[2], 4);    // 1st follow up: 4 days
    assert.equal(FOLLOW_UP_GAP_DAYS[3], 8);    // 2nd follow up: 8 days
    assert.equal(FOLLOW_UP_GAP_DAYS[4], 12);   // 3rd follow up: 12 days
    assert.equal(FOLLOW_UP_GAP_DAYS[5], 102);  // re-engagement: 102 days
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

  it("generates 1st follow up after 4+ days (draft 1 day early)", () => {
    const messages = [makeMessage(1, "sent", 4)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 2);
    assert.equal(result.followUpLabel, "1st follow up");
    assert.equal(result.newStage, "follow_up_1");
  });

  it("skips 1st follow up if only 2 days since initial send", () => {
    const messages = [makeMessage(1, "sent", 2)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "too_early");
  });

  it("generates 2nd follow up after 8+ days from initial", () => {
    const messages = [
      makeMessage(1, "sent", 9),
      makeMessage(2, "sent", 5),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 3);
    assert.equal(result.followUpLabel, "2nd follow up");
    assert.equal(result.newStage, "follow_up_2");
  });

  it("generates 3rd follow up after 12+ days from initial", () => {
    const messages = [
      makeMessage(1, "sent", 13),
      makeMessage(2, "sent", 9),
      makeMessage(3, "sent", 5),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 4);
    assert.equal(result.followUpLabel, "3rd follow up");
    assert.equal(result.newStage, "follow_up_2");
  });

  it("generates re-engagement (step 5) after 102+ days from initial", () => {
    const messages = [
      makeMessage(1, "sent", 103),
      makeMessage(2, "sent", 99),
      makeMessage(3, "sent", 95),
      makeMessage(4, "sent", 91),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 5);
    assert.equal(result.followUpLabel, "re-engagement");
    assert.equal(result.newStage, "follow_up_2");
  });

  it("completes sequence after all 5 steps sent", () => {
    const messages = [
      makeMessage(1, "sent", 104),
      makeMessage(2, "sent", 100),
      makeMessage(3, "sent", 96),
      makeMessage(4, "sent", 92),
      makeMessage(5, "sent", 1),
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
    // Initial sent 13 days ago, step 3 sent 1 day ago
    // Step 4 due at day 12 from initial = already happened (day 12 - 13 = -1, so 1 day past due)
    // This tests that timing is based on initial send, not latest send
    const messages = [
      makeMessage(1, "sent", 13),
      makeMessage(2, "sent", 9),
      makeMessage(3, "sent", 1),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 4);
  });

  it("generates step 4 when initial sent 11+ days ago", () => {
    // Initial sent 11 days ago → step 4 due day 12 = 1 day from now
    // Draft due day 11 = today → ready to generate
    const messages = [
      makeMessage(1, "sent", 11),
      makeMessage(2, "sent", 7),
      makeMessage(3, "sent", 3),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 4);
  });

  it("uses last sent date as fallback when no step 1 found", () => {
    // Edge case: step 1 message missing, only step 2 exists as sent
    // Step 2 sent 8 days ago, step 3 due 8 days after = today
    // Draft due 1 day early = yesterday = overdue, should generate
    const messages = [
      makeMessage(2, "sent", 8),
    ];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 3);
  });
});

// ---- shouldGenerateEscalationDm ----

describe("shouldGenerateEscalationDm", () => {
  it("returns true when step 2 unopened 3+ days, no existing DM", () => {
    const messages = [
      makeMessage(1, "sent", 7),
      {
        ...makeMessage(2, "sent", 4),
        opened: false,
        channel: "email",
      },
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, true);
  });

  it("returns true when step 2 unopened 5+ days, no existing DM", () => {
    const messages = [
      makeMessage(1, "sent", 9),
      {
        ...makeMessage(2, "sent", 6),
        opened: false,
        channel: "email",
      },
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, true);
  });

  it("returns false when no step 2 sent message", () => {
    const messages = [
      makeMessage(1, "sent", 8),
      makeMessage(2, "draft", 0),
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, false);
  });

  it("returns false when step 2 opened", () => {
    const messages = [
      makeMessage(1, "sent", 7),
      {
        ...makeMessage(2, "sent", 4),
        opened: true,
        channel: "email",
      },
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, false);
  });

  it("returns false when step 2 sent less than 3 days ago", () => {
    const messages = [
      makeMessage(1, "sent", 7),
      {
        ...makeMessage(2, "sent", 2),
        opened: false,
        channel: "email",
      },
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, false);
  });

  it("returns false when exactly 3 days - boundary check", () => {
    // At exactly 3 days, it should be true (>= 3)
    const messages = [
      makeMessage(1, "sent", 7),
      {
        ...makeMessage(2, "sent", 3),
        opened: false,
        channel: "email",
      },
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, true);
  });

  it("returns false when escalation DM already exists (planned)", () => {
    const messages = [
      makeMessage(1, "sent", 7),
      {
        ...makeMessage(2, "sent", 4),
        opened: false,
        channel: "email",
      },
      {
        id: "dm-1",
        lead_id: "lead-1",
        step_number: 2,
        status: "planned",
        channel: "instagram_dm",
        is_channel_escalation: true,
        created_at: daysAgo(3),
        sent_at: null,
      },
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, false);
  });

  it("returns false when escalation DM already exists (draft)", () => {
    const messages = [
      makeMessage(1, "sent", 7),
      {
        ...makeMessage(2, "sent", 4),
        opened: false,
        channel: "email",
      },
      {
        id: "dm-1",
        lead_id: "lead-1",
        step_number: 2,
        status: "draft",
        channel: "instagram_dm",
        is_channel_escalation: true,
        created_at: daysAgo(3),
        sent_at: null,
      },
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, false);
  });

  it("returns false when escalation DM already exists (approved)", () => {
    const messages = [
      makeMessage(1, "sent", 7),
      {
        ...makeMessage(2, "sent", 4),
        opened: false,
        channel: "email",
      },
      {
        id: "dm-1",
        lead_id: "lead-1",
        step_number: 2,
        status: "approved",
        channel: "instagram_dm",
        is_channel_escalation: true,
        created_at: daysAgo(3),
        sent_at: null,
      },
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, false);
  });

  it("returns false when escalation DM already sent", () => {
    const messages = [
      makeMessage(1, "sent", 7),
      {
        ...makeMessage(2, "sent", 4),
        opened: false,
        channel: "email",
      },
      {
        id: "dm-1",
        lead_id: "lead-1",
        step_number: 2,
        status: "sent",
        channel: "instagram_dm",
        is_channel_escalation: true,
        created_at: daysAgo(3),
        sent_at: daysAgo(1),
      },
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, false);
  });

  it("ignores non-escalation DMs when checking for existing", () => {
    const messages = [
      makeMessage(1, "sent", 7),
      {
        ...makeMessage(2, "sent", 4),
        opened: false,
        channel: "email",
      },
      {
        id: "dm-1",
        lead_id: "lead-1",
        step_number: 3,
        status: "draft",
        channel: "instagram_dm",
        is_channel_escalation: false,
        created_at: daysAgo(2),
        sent_at: null,
      },
    ];
    const result = shouldGenerateEscalationDm(messages, new Date());
    assert.equal(result, true);
  });
});

// ---- Timing edge cases ----

describe("timing edge cases", () => {
  it("day 2: too early for 1st follow up (due day 4, draft day 3)", () => {
    const messages = [makeMessage(1, "sent", 2)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "too_early");
  });

  it("day 3: ready for draft (1 day before due date day 4)", () => {
    // Initial sent 3 days ago, step 2 due day 4, draft generated day 3 = today
    const messages = [makeMessage(1, "sent", 3)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 2);
  });

  it("day 4: on due date for draft generation", () => {
    // Initial sent 4 days ago, step 2 due day 4, draft generated day 3 = yesterday (overdue)
    const messages = [makeMessage(1, "sent", 4)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 2);
  });

  it("day 5: overdue, still generates", () => {
    const messages = [makeMessage(1, "sent", 5)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 2);
  });

  it("day 8: well overdue, still generates", () => {
    const messages = [makeMessage(1, "sent", 8)];
    const result = determineFollowUpAction(messages, new Date());
    assert.equal(result.action, "generate");
    assert.equal(result.nextStepNumber, 2);
  });
});

// ---- Full sequence simulation ----

describe("full sequence simulation", () => {
  it("walks through entire 5-step sequence with 4-day gaps", () => {
    const now = new Date();

    // Day 0: initial sent 13 days ago
    let messages = [makeMessage(1, "sent", 13)];

    // Day 12 (1 day before due): generate 1st follow up
    let result = determineFollowUpAction(messages, now);
    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "1st follow up");

    // Simulate: 1st follow up was sent 9 days ago
    messages.push(makeMessage(2, "sent", 9));

    // Day 8 (1 day before due): generate 2nd follow up
    result = determineFollowUpAction(messages, now);
    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "2nd follow up");

    // Simulate: 2nd follow up was sent 5 days ago
    messages.push(makeMessage(3, "sent", 5));

    // Day 4 (1 day before due): generate 3rd follow up
    result = determineFollowUpAction(messages, now);
    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "3rd follow up");

    // Simulate: 3rd follow up was sent 1 day ago
    messages.push(makeMessage(4, "sent", 1));

    // Day 1 (3 days before step 5 due): not yet ready for re-engagement
    result = determineFollowUpAction(messages, now);
    assert.equal(result.action, "skip");
    assert.equal(result.reason, "too_early");

    // Simulate time passing: initial now 103 days ago
    const futureMessages = [
      makeMessage(1, "sent", 103),
      makeMessage(2, "sent", 99),
      makeMessage(3, "sent", 95),
      makeMessage(4, "sent", 91),
    ];
    result = determineFollowUpAction(futureMessages, now);
    assert.equal(result.action, "generate");
    assert.equal(result.followUpLabel, "re-engagement");

    // Simulate: re-engagement sent
    futureMessages.push(makeMessage(5, "sent", 1));

    // Sequence complete
    result = determineFollowUpAction(futureMessages, now);
    assert.equal(result.action, "complete");
    assert.equal(result.newStage, "no_response");
  });
});
