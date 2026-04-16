import { test } from "node:test";
import assert from "node:assert";

/**
 * Build a meta-prompt for Claude to synthesize rules from feedback.
 */
function buildRulesMetaPrompt(feedbacks) {
  let feedbackText = "# Edit Feedback Summary (Last 28 Days)\n\n";
  const categories = {};
  for (const fb of feedbacks) {
    const venueCat = fb.venue_category || "unknown";
    if (!categories[venueCat]) categories[venueCat] = [];
    categories[venueCat].push(fb);

    feedbackText += `## ${venueCat}\n`;
    if (fb.original_subject && fb.edited_subject && fb.original_subject !== fb.edited_subject) {
      feedbackText += `**Subject change**: "${fb.original_subject}" → "${fb.edited_subject}"\n`;
    }
    feedbackText += `**Original**: ${fb.original_content.slice(0, 300)}\n`;
    feedbackText += `**Edited**: ${fb.edited_content.slice(0, 300)}\n`;
    if (fb.reflection_note) {
      feedbackText += `**Reason**: ${fb.reflection_note}\n`;
    }
    feedbackText += "\n";
  }

  return `You are reviewing email feedback...
${feedbackText}
Synthesize 5–10 markdown bullet-point rules...`;
}

/**
 * Assemble system prompt with optional rules and feedback blocks.
 */
function assembleSystemPrompt(basePropmt, rules, feedbackBlock) {
  return basePropmt
    + (rules ? `\n\nPROMPT RULES (apply to every email):\n${rules}` : "")
    + (feedbackBlock || "");
}

/**
 * Extract active version ID from pointer doc data.
 */
function getActiveVersionId(pointerData) {
  return pointerData?.active_version_id || null;
}

test("buildRulesMetaPrompt - includes venue_category in header", () => {
  const feedbacks = [
    {
      venue_category: "cocktail_bar",
      original_content: "Hello, we make vermouth.",
      edited_content: "Hi there, we're Asterley Bros.",
      reflection_note: "More personable greeting",
    },
  ];
  const prompt = buildRulesMetaPrompt(feedbacks);
  assert(prompt.includes("cocktail_bar"), "Should include venue category");
  assert(prompt.includes("Edit Feedback Summary"), "Should have header");
});

test("buildRulesMetaPrompt - includes reflection_note when present", () => {
  const feedbacks = [
    {
      venue_category: "pub",
      original_content: "text",
      edited_content: "edited text",
      reflection_note: "Better tone",
    },
  ];
  const prompt = buildRulesMetaPrompt(feedbacks);
  assert(prompt.includes("Better tone"), "Should include reflection note");
});

test("buildRulesMetaPrompt - omits reflection_note when missing", () => {
  const feedbacks = [
    {
      venue_category: "wine_bar",
      original_content: "text",
      edited_content: "edited text",
    },
  ];
  const prompt = buildRulesMetaPrompt(feedbacks);
  assert(prompt.includes("wine_bar"), "Should include category");
  // Reflection note should not be in the output
  const lines = prompt.split("\n");
  const reasonLines = lines.filter((l) => l.includes("**Reason**:"));
  assert.strictEqual(reasonLines.length, 0, "Should not include empty reason");
});

test("buildRulesMetaPrompt - includes subject change when different", () => {
  const feedbacks = [
    {
      venue_category: "gastropub",
      original_subject: "English Vermouth",
      edited_subject: "Local Spirit for Your Menu",
      original_content: "text",
      edited_content: "edited",
    },
  ];
  const prompt = buildRulesMetaPrompt(feedbacks);
  assert(prompt.includes("Subject change"), "Should include subject change marker");
  assert(prompt.includes("English Vermouth"), "Should include original subject");
  assert(prompt.includes("Local Spirit for Your Menu"), "Should include edited subject");
});

test("assembleSystemPrompt - rules before feedback", () => {
  const base = "BASE";
  const rules = "RULES";
  const feedback = "FEEDBACK";
  const result = assembleSystemPrompt(base, rules, feedback);
  const rulesIndex = result.indexOf(rules);
  const feedbackIndex = result.indexOf(feedback);
  assert(rulesIndex < feedbackIndex, "Rules should come before feedback");
});

test("assembleSystemPrompt - omits rules when empty", () => {
  const base = "BASE";
  const result = assembleSystemPrompt(base, "", "FEEDBACK");
  assert(!result.includes("PROMPT RULES"), "Should not include rules section when empty");
  assert(result.includes("FEEDBACK"), "Should still include feedback");
});

test("assembleSystemPrompt - omits feedback when empty", () => {
  const base = "BASE";
  const rules = "RULES";
  const result = assembleSystemPrompt(base, rules, "");
  assert(result.includes("PROMPT RULES"), "Should include rules");
  assert(result.endsWith("RULES"), "Should end with rules when no feedback");
});

test("assembleSystemPrompt - handles both empty", () => {
  const base = "BASE";
  const result = assembleSystemPrompt(base, "", "");
  assert.strictEqual(result, "BASE", "Should be just base when both empty");
});

test("getActiveVersionId - returns version_id from pointer data", () => {
  const pointerData = { active_version_id: "v_1234567890", generated_at: "2026-01-01T00:00:00Z" };
  const versionId = getActiveVersionId(pointerData);
  assert.strictEqual(versionId, "v_1234567890");
});

test("getActiveVersionId - returns null when data missing", () => {
  const versionId = getActiveVersionId({});
  assert.strictEqual(versionId, null);
});

test("getActiveVersionId - returns null when data is null", () => {
  const versionId = getActiveVersionId(null);
  assert.strictEqual(versionId, null);
});
