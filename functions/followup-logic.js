/**
 * Pure follow-up scheduling logic — extracted for testability.
 * No Firebase, no Anthropic, no side effects.
 */

export const FOLLOW_UP_LABELS = {
  1: "initial",
  2: "1st follow up",
  3: "2nd follow up",
  4: "3rd follow up",
  5: "re-engagement",
};

export const FOLLOW_UP_GAP_DAYS = {
  2: 4,    // 1st follow up: 4 days after initial
  3: 8,    // 2nd follow up: 8 days after initial
  4: 12,   // 3rd follow up: 12 days after initial
  5: 102,  // re-engagement: 102 days after initial (90 days after step 4)
};

const DRAFT_LEAD_DAYS = 1;

/**
 * Determine whether a lead should be skipped entirely from follow-up generation.
 * Returns a reason string if skipped, or null if eligible.
 */
export function shouldSkipLead(lead, hasReply) {
  if (hasReply) return "has_reply";
  if (["responded", "converted", "declined"].includes(lead.stage)) return "terminal_stage";
  if (lead.client_status === "snoozed") return "snoozed";
  if (lead.client_status === "current_account") return "current_account";
  if (lead.client_status === "in_discussion") return "in_discussion";
  if (lead.human_takeover === true) return "human_takeover";
  return null;
}

/**
 * Given a lead's sent messages, determine what follow-up action to take.
 *
 * @param {Array} messages - All outreach messages for this lead, sorted by sent_at desc
 * @param {Date} now - Current date/time
 * @returns {{ action: string, nextStepNumber?: number, followUpLabel?: string, scheduledSendDate?: string, newStage?: string }}
 */
export function determineFollowUpAction(messages, now) {
  // Find sent messages and determine highest step completed
  const sentMessages = messages.filter((m) => m.status === "sent" && m.sent_at);
  if (sentMessages.length === 0) {
    return { action: "skip", reason: "no_sent_message" };
  }

  const lastStepNumber = Math.max(...sentMessages.map((m) => m.step_number || 1));
  const nextStepNumber = lastStepNumber + 1;

  // Sequence complete
  if (nextStepNumber > 5) {
    return { action: "complete", reason: "sequence_exhausted", newStage: "no_response" };
  }

  // Check if draft, planned, or approved already exists for next step
  const existingDraft = messages.find(
    (m) => m.step_number === nextStepNumber &&
      (m.status === "draft" || m.status === "approved" || m.status === "planned")
  );
  if (existingDraft) {
    return { action: "skip", reason: "draft_exists" };
  }

  // Calculate timing from the initial send
  const initialSent = messages
    .filter((m) => m.status === "sent" && m.step_number === 1)
    .sort((a, b) => (a.sent_at || "").localeCompare(b.sent_at || ""))[0];

  // Fall back to the most recent sent message if no step 1 found
  const latestSent = sentMessages.sort((a, b) => (b.sent_at || "").localeCompare(a.sent_at || ""))[0];
  const referenceDate = initialSent ? new Date(initialSent.sent_at) : new Date(latestSent.sent_at);
  const gapDays = FOLLOW_UP_GAP_DAYS[nextStepNumber];
  const scheduledSendDate = new Date(referenceDate);
  scheduledSendDate.setDate(scheduledSendDate.getDate() + gapDays);

  // Generate draft if today >= scheduled_send_date - DRAFT_LEAD_DAYS
  const draftGenerateDate = new Date(scheduledSendDate);
  draftGenerateDate.setDate(draftGenerateDate.getDate() - DRAFT_LEAD_DAYS);

  if (now < draftGenerateDate) {
    return {
      action: "skip",
      reason: "too_early",
      daysUntilDraft: Math.ceil((draftGenerateDate - now) / (1000 * 60 * 60 * 24)),
    };
  }

  // Determine new lead stage
  const newStage = nextStepNumber === 2 ? "follow_up_1"
    : nextStepNumber >= 3 && nextStepNumber <= 4 ? "follow_up_2"
    : nextStepNumber === 5 ? "follow_up_2"
    : null;

  return {
    action: "generate",
    nextStepNumber,
    followUpLabel: FOLLOW_UP_LABELS[nextStepNumber],
    scheduledSendDate: scheduledSendDate.toISOString().split("T")[0],
    newStage,
  };
}

/**
 * Determine if an Instagram DM escalation should be generated.
 * Returns true if step 2 email was sent, has no opens, is at least 3 days old,
 * and no escalation DM already exists.
 *
 * @param {Array} messages - All outreach messages for this lead
 * @param {Date} now - Current date/time
 * @returns {boolean}
 */
export function shouldGenerateEscalationDm(messages, now) {
  const step2Email = messages.find(
    (m) => m.step_number === 2 && m.channel === "email" && m.status === "sent"
  );
  if (!step2Email) return false;

  // Already have an escalation DM (planned, draft, approved, or sent)
  const existingDm = messages.find(
    (m) => m.is_channel_escalation === true &&
      (m.status === "planned" || m.status === "draft" || m.status === "approved" || m.status === "sent")
  );
  if (existingDm) return false;

  // Wait at least 3 days after step 2 send before escalating
  const step2SentAt = new Date(step2Email.sent_at);
  const daysSinceSent = (now - step2SentAt) / (1000 * 60 * 60 * 24);
  if (daysSinceSent < 3) return false;

  // Escalate only if not opened
  return !step2Email.opened;
}
