// Extracts structural features from subject lines and email bodies so we can
// correlate features with downstream open/reply outcomes.

const PERSONAL_TOKENS = [
  /\byour\b/i,
  /\byou\b/i,
  /\byour bar\b/i,
  /\byour menu\b/i,
  /\byour team\b/i,
];

const CTA_PATTERNS = {
  meeting: /\b(meet|chat|call|coffee|zoom|sit down|grab a)\b/i,
  tasting: /\b(tasting|sample|try|sip)\b/i,
  reply: /\b(reply|let me know|thoughts|interested|open to|worth)\b/i,
  question: /\?\s*$/,
};

const TONE_HINTS = {
  casual: /\b(hey|cheers|y'all|btw|gonna)\b/i,
  formal: /\b(dear|kind regards|sincerely|please find)\b/i,
};

function wordCount(text) {
  if (!text) return 0;
  const trimmed = String(text).trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function bucketLength(words, type) {
  if (type === "subject") {
    if (words <= 3) return "very_short";
    if (words <= 6) return "short";
    if (words <= 10) return "medium";
    return "long";
  }
  if (words < 60) return "very_short";
  if (words < 100) return "short";
  if (words < 140) return "medium";
  if (words < 180) return "long";
  return "very_long";
}

export function extractSubjectFeatures(subject) {
  if (!subject) return null;
  const s = String(subject);
  const words = wordCount(s);
  const hasQuestion = /\?/.test(s);
  const personalizationCount = PERSONAL_TOKENS.reduce(
    (n, re) => n + (re.test(s) ? 1 : 0),
    0
  );
  const startsWithName = /^[A-Z][a-z]+,/.test(s);
  const hasNumber = /\d/.test(s);
  const lowercase = s === s.toLowerCase() && /[a-z]/.test(s);
  return {
    word_count: words,
    length_bucket: bucketLength(words, "subject"),
    has_question: hasQuestion,
    personalization_count: personalizationCount,
    starts_with_name: startsWithName,
    has_number: hasNumber,
    all_lowercase: lowercase,
    char_count: s.length,
  };
}

export function extractContentFeatures(content) {
  if (!content) return null;
  const c = String(content);
  const words = wordCount(c);
  const sentences = c.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const paragraphs = c.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  const questionCount = (c.match(/\?/g) || []).length;
  const exclamationCount = (c.match(/!/g) || []).length;

  let ctaType = "none";
  if (CTA_PATTERNS.tasting.test(c)) ctaType = "tasting";
  else if (CTA_PATTERNS.meeting.test(c)) ctaType = "meeting";
  else if (CTA_PATTERNS.question.test(c.trim()) || questionCount > 0) ctaType = "question";
  else if (CTA_PATTERNS.reply.test(c)) ctaType = "reply";

  let toneSignal = "neutral";
  if (TONE_HINTS.casual.test(c)) toneSignal = "casual";
  else if (TONE_HINTS.formal.test(c)) toneSignal = "formal";

  const personalizationCount = PERSONAL_TOKENS.reduce(
    (n, re) => n + (c.match(new RegExp(re, "gi")) || []).length,
    0
  );

  // Where does the ask sit — first paragraph, middle, or last?
  const lines = c.split("\n").filter((l) => l.trim().length > 0);
  let askPlacement = "unknown";
  if (lines.length > 0) {
    const askIdx = lines.findIndex((l) => /\?/.test(l) || /\b(meet|chat|tasting|sample|try)\b/i.test(l));
    if (askIdx === -1) askPlacement = "no_ask";
    else if (askIdx <= 1) askPlacement = "early";
    else if (askIdx >= lines.length - 2) askPlacement = "late";
    else askPlacement = "middle";
  }

  return {
    word_count: words,
    length_bucket: bucketLength(words, "content"),
    sentence_count: sentences,
    paragraph_count: paragraphs,
    question_count: questionCount,
    exclamation_count: exclamationCount,
    cta_type: ctaType,
    tone_signal: toneSignal,
    personalization_count: personalizationCount,
    ask_placement: askPlacement,
  };
}

// segment_key groups leads so suggestions/few-shot pull from comparable cohorts.
// Coarse on purpose — fine-grained slices won't have enough samples.
export function buildSegmentKey(lead, enrichment) {
  const cat = (enrichment?.venue_category || lead?.category || "unknown").toLowerCase();
  const tone = (enrichment?.tone_tier || "unknown").toLowerCase();
  const city = (lead?.city || lead?.location_city || "unknown").toLowerCase().replace(/\s+/g, "_");
  return `${cat}|${tone}|${city}`;
}

export function buildBroadSegmentKey(lead, enrichment) {
  const cat = (enrichment?.venue_category || lead?.category || "unknown").toLowerCase();
  const tone = (enrichment?.tone_tier || "unknown").toLowerCase();
  return `${cat}|${tone}`;
}
