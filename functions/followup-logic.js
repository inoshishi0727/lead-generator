/**
 * Pure follow-up scheduling logic — extracted for testability.
 * No Firebase, no Anthropic, no side effects.
 */

export const FOLLOW_UP_LABELS = {
  1: "initial",
  2: "1st follow up",
  3: "2nd follow up",
  4: "3rd follow up",
};

export const FOLLOW_UP_GAP_DAYS = {
  2: 7,   // 1st follow up: 7 days after initial
  3: 14,  // 2nd follow up: 14 days after initial
  4: 18,  // 3rd follow up: 18 days after initial
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
  if (nextStepNumber > 4) {
    return { action: "complete", reason: "sequence_exhausted", newStage: "no_response" };
  }

  // Check if draft already exists for next step
  const existingDraft = messages.find(
    (m) => m.step_number === nextStepNumber && (m.status === "draft" || m.status === "approved")
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
    : nextStepNumber >= 3 ? "follow_up_2"
    : null;

  return {
    action: "generate",
    nextStepNumber,
    followUpLabel: FOLLOW_UP_LABELS[nextStepNumber],
    scheduledSendDate: scheduledSendDate.toISOString().split("T")[0],
    newStage,
  };
}
