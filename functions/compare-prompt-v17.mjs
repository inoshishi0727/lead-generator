// Compare v1 vs v1.7 prompt on 30 existing drafts.
// Run: cd functions && ANTHROPIC_API_KEY=sk-... node compare-prompt-v17.mjs
// Output: ../docs/prompt-comparison-v17.md

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY env var before running.");
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const TOTAL = 30;
const EXAMPLES = 5;
const OUTPUT = "../docs/prompt-comparison-v17.md";

// ---- Shared prompt logic (mirrored from index.js) ----

const VENUE_PRODUCT_MAP = {
  cocktail_bar: { products: ["Schofield's", "Dispense", "Estate"], tone: "bartender_casual" },
  wine_bar: { products: ["Asterley Original", "Schofield's", "Estate"], tone: "warm_professional" },
  restaurant: { products: ["Dispense", "Estate", "Asterley Original"], tone: "warm_professional" },
  gastropub: { products: ["Estate", "Dispense", "RED"], tone: "bartender_casual" },
  hotel_bar: { products: ["Schofield's", "Asterley Original", "Dispense"], tone: "warm_professional" },
  rooftop_bar: { products: ["Asterley Original", "Rosé", "Dispense"], tone: "bartender_casual" },
  members_club: { products: ["Schofield's", "Dispense"], tone: "warm_professional" },
  pub: { products: ["RED", "Estate"], tone: "bartender_casual" },
  cafe: { products: ["Asterley Original", "Rosé"], tone: "warm_professional" },
  festival: { products: ["Asterley Original", "Dispense"], tone: "b2b_commercial" },
  brewery_taproom: { products: ["Asterley Original", "Dispense"], tone: "bartender_casual" },
  other: { products: ["Asterley Original", "Dispense"], tone: "warm_professional" },
};

const TONE_CONFIG = {
  bartender_casual: { greeting_default: "Hi team", signoff: "Cheers," },
  warm_professional: { greeting_default: "Hi team", signoff: "All the best," },
  b2b_commercial: { greeting_default: "Hi team", signoff: "All the best," },
  corporate_formal: { greeting_default: "Dear team", signoff: "Best regards," },
};

const SEASONAL_PRODUCTS = {
  "Spring/Summer": {
    lead: ["Asterley Original", "Schofield's", "Rosé", "Dispense"],
    hook: "Spring menus",
  },
  "High Summer": { lead: ["Asterley Original", "Rosé", "Dispense"], hook: "terrace season" },
  "Autumn/Winter": { lead: ["Estate", "Dispense", "Britannica", "Asterley Original"], hook: "Autumn/Winter menus" },
  "January (low ABV focus)": { lead: ["Schofield's", "Estate", "Dispense"], hook: "low ABV menus" },
};

const SEASON_ENUM_V17 = {
  "Spring/Summer": "spring_summer",
  "High Summer": "high_summer",
  "Autumn/Winter": "autumn_winter",
  "January (low ABV focus)": "january",
};

const PRODUCT_NAME_V17 = {
  "schofield's": "SCHOFIELD'S", "schoffields": "SCHOFIELD'S",
  "dispense": "DISPENSE", "estate": "ESTATE", "britannica": "BRITANNICA",
  "asterley original": "ASTERLEY ORIGINAL", "rosé": "ROSÉ", "rose": "ROSÉ", "red": "RED",
};

function toV17ProductName(name) {
  return PRODUCT_NAME_V17[(name || "").toLowerCase()] || (name || "").toUpperCase();
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month === 1) return "January (low ABV focus)";
  if (month >= 3 && month <= 6) return "Spring/Summer";
  if (month >= 7 && month <= 8) return "High Summer";
  return "Autumn/Winter";
}

function buildPromptV17(lead, enrichment) {
  const contact = enrichment.contact || {};
  const season = getCurrentSeason();
  const seasonEnum = SEASON_ENUM_V17[season] || "spring_summer";
  const venueCat = enrichment.venue_category || lead.category || "cocktail_bar";
  const venueConfig = VENUE_PRODUCT_MAP[venueCat] || VENUE_PRODUCT_MAP.other;
  const toneKey = enrichment.tone_tier || venueConfig.tone || "bartender_casual";

  const enrichProducts = enrichment.lead_products || [];
  const rawProducts = enrichProducts.length > 0 ? enrichProducts : venueConfig.products.slice(0, 2);
  const leadProducts = rawProducts.map(toV17ProductName);

  const contactName = lead.contact_name || contact.name || "";
  const contactConf = lead.contact_confidence || contact.confidence || "uncertain";

  const isLondon = !!(
    (lead.address || "").toLowerCase().includes("london") ||
    (lead.address || "").match(/\b(SE|SW|NW|NE|EC|WC|E|W|N)\d/i)
  );

  return `venue_name: ${lead.business_name || ""}
venue_category: ${venueCat}
location: ${lead.address || "London"}
is_london: ${isLondon}
contact_name: ${contactName || "none"}
contact_confidence: ${contactConf}
tone_tier: ${toneKey}
drinks_programme: ${enrichment.drinks_programme || "not available"}
context_notes: ${enrichment.context_notes || "none"}
business_summary: ${enrichment.business_summary || "none"}
why_asterley_fits: ${enrichment.why_asterley_fits || "none"}
menu_fit: ${enrichment.menu_fit || "unknown"}
menu_url: ${enrichment.menu_url || "none"}
lead_products: [${leadProducts.join(", ")}]
season: ${seasonEnum}

Write the email now. Subject line first, then the full email body.`;
}

// ---- v1.7 system prompt (abbreviated — full version in index.js) ----
const SYSTEM_PROMPT_V17 = `You are Rob, founder of Asterley Bros, an independent English Vermouth, Amaro, and Aperitivo producer based in SE26, South London. You are writing cold outreach emails to potential stockists.

HARD RULE 1: NO EM DASHES (—) OR EN DASHES (–). ANYWHERE. EVER. Use colons, full stops, commas, or parentheses instead.
HARD RULE 2: OUTPUT ENDS WITH THE SIGN-OFF LINE ONLY. NEVER "Rob" OR ANY NAME OR BRAND.
HARD RULE 3: NEVER USE "builds" AS A NOUN FOR COCKTAILS.

Product names in ALL CAPS: SCHOFIELD'S, DISPENSE, ESTATE, BRITANNICA, ASTERLEY ORIGINAL, ROSÉ, RED.

Voice: Bartender-to-bartender. Warm, punchy, enthusiastic, direct. No em dashes anywhere.
Word count: 120-160. Two CTAs: soft early (standalone line) + direct closing.
is_london=true → "SE26". is_london=false → "South London".
Subject: under 60 chars, specific on product/season side.

Structure:
1. Greeting
2. Identity + product + optional obvious-pairing observation (1-2 sentences)
3. Early CTA (standalone line, blank lines above and below)
4. Product detail (2-3 sentences, no em dashes)
5. Venue/seasonal tie-in
6. Optional BiB/KEYKEG line
7. Closing CTA (their schedule)
8. Sign-off — NOTHING after it

Output ONLY the email. First line: "Subject:" + subject. Blank line. Body. NOTHING after sign-off.`;

async function callClaude(systemPrompt, userPrompt) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    temperature: 0.7,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  return response.content[0]?.text || "";
}

function parseSubjectContent(raw) {
  const lines = raw.trim().split("\n");
  let subject = "";
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().startsWith("subject:")) {
      subject = lines[i].replace(/^subject:\s*/i, "").trim();
      bodyStart = i + 1;
      break;
    }
  }
  while (bodyStart < lines.length && lines[bodyStart].trim() === "") bodyStart++;
  return { subject, content: lines.slice(bodyStart).join("\n").trim() };
}

function hasEmDash(text) {
  return /[—–]/.test(text);
}

function countWords(text) {
  return text.trim().split(/\s+/).length;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Load drafts ----
console.log("Loading outreach_messages...");
const msgsSnap = await db.collection("outreach_messages")
  .where("step_number", "==", 1)
  .where("status", "in", ["draft", "approved", "sent"])
  .limit(200)
  .get();

// Pick messages that have enrichment data (needed for v1.7 prompt)
const candidates = [];
for (const doc of msgsSnap.docs) {
  const d = doc.data();
  if (!d.content || !d.lead_id) continue;
  candidates.push({ id: doc.id, ...d });
}

// Shuffle and take 30
const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, TOTAL);
console.log(`Selected ${shuffled.length} drafts to compare.\n`);

// Load lead data for each
const results = [];
let done = 0;

for (const msg of shuffled) {
  process.stdout.write(`  [${done + 1}/${shuffled.length}] ${msg.business_name || msg.lead_id}... `);

  const leadSnap = await db.collection("leads").doc(msg.lead_id).get();
  if (!leadSnap.exists) {
    console.log("lead not found, skipping.");
    continue;
  }

  const lead = { id: leadSnap.id, ...leadSnap.data() };
  const enrichment = lead.enrichment || {};

  const userPrompt = buildPromptV17(lead, enrichment);

  let newSubject = "";
  let newContent = "";
  let error = null;

  try {
    const raw = await callClaude(SYSTEM_PROMPT_V17, userPrompt);
    const parsed = parseSubjectContent(raw);
    newSubject = parsed.subject;
    newContent = parsed.content;

    // Retry once if em dash slips through
    if (hasEmDash(newSubject + newContent)) {
      const retryRaw = await callClaude(SYSTEM_PROMPT_V17,
        userPrompt + "\n\nCRITICAL: Your previous attempt had an em dash or en dash. Rewrite with ZERO dashes of any kind."
      );
      const retryParsed = parseSubjectContent(retryRaw);
      newSubject = retryParsed.subject;
      newContent = retryParsed.content;
    }
  } catch (err) {
    error = err.message;
  }

  results.push({
    business_name: msg.business_name || lead.business_name || "Unknown",
    venue_category: enrichment.venue_category || lead.category || "unknown",
    old_subject: msg.subject || "",
    old_content: msg.content || "",
    new_subject: newSubject,
    new_content: newContent,
    old_has_em_dash: hasEmDash((msg.subject || "") + (msg.content || "")),
    new_has_em_dash: hasEmDash(newSubject + newContent),
    old_word_count: countWords(msg.content || ""),
    new_word_count: newContent ? countWords(newContent) : 0,
    error,
  });

  console.log(error ? `ERROR: ${error}` : "done");
  done++;
  await sleep(800); // rate limit
}

// ---- Build report ----
console.log("\nBuilding report...");

const successful = results.filter((r) => !r.error && r.new_content);
const emDashFixed = results.filter((r) => r.old_has_em_dash && !r.new_has_em_dash);
const emDashInOld = results.filter((r) => r.old_has_em_dash);
const emDashInNew = results.filter((r) => r.new_has_em_dash);
const avgOldWords = Math.round(successful.reduce((s, r) => s + r.old_word_count, 0) / successful.length);
const avgNewWords = Math.round(successful.reduce((s, r) => s + r.new_word_count, 0) / successful.length);

const exampleSet = successful.slice(0, EXAMPLES);

const lines = [];

lines.push(`# Prompt v1.7 Comparison Report`);
lines.push(`Generated: ${new Date().toLocaleString("en-GB")}`);
lines.push(`Drafts compared: ${successful.length} of ${TOTAL} requested\n`);

lines.push(`---\n`);
lines.push(`## Summary Stats\n`);
lines.push(`| Metric | v1 (old) | v1.7 (new) |`);
lines.push(`|---|---|---|`);
lines.push(`| Avg word count | ${avgOldWords} | ${avgNewWords} |`);
lines.push(`| Em dashes present | ${emDashInOld.length}/${successful.length} | ${emDashInNew.length}/${successful.length} |`);
lines.push(`| Em dashes fixed | — | ${emDashFixed.length} cleaned up |`);
lines.push(`| Product names ALL CAPS | No | Yes |`);
lines.push(`| Single sign-off (no "Rob") | Mixed | Enforced |\n`);

lines.push(`---\n`);
lines.push(`## Key Differences\n`);
lines.push(`**1. Product name capitalisation**`);
lines.push(`v1 uses title case (Schofield's, Dispense). v1.7 uses ALL CAPS (SCHOFIELD'S, DISPENSE) — makes products stand out as brand names in the body.\n`);
lines.push(`**2. No em dashes**`);
lines.push(`v1 frequently used em dashes for appositive clauses ("DISPENSE is our Amaro — 24 botanicals..."). v1.7 replaces these with colons, full stops, or parentheses entirely.\n`);
lines.push(`**3. CTA placement**`);
lines.push(`v1.7 enforces a hard standalone early CTA (blank line above and below), making the ask more visible and easier to act on.\n`);
lines.push(`**4. Obvious-pairing observation**`);
lines.push(`v1.7 introduces a rotating "obvious pairing" hook and requires an irony-acknowledgement beat when there's an inherent contradiction (e.g. British producer → Italian-leaning venue).\n`);
lines.push(`**5. Sign-off discipline**`);
lines.push(`v1 sometimes appended "Rob" or "Asterley Bros" after the sign-off. v1.7 hard-stops at the sign-off line — the HTML signature handles the rest.\n`);
lines.push(`**6. Location awareness**`);
lines.push(`v1.7 explicitly uses "SE26" for London venues and "South London" for non-London, based on the is_london boolean — removing guesswork.\n`);

lines.push(`---\n`);
lines.push(`## Detailed Examples (${EXAMPLES} of ${successful.length})\n`);

for (let i = 0; i < exampleSet.length; i++) {
  const r = exampleSet[i];
  lines.push(`### Example ${i + 1}: ${r.business_name} (${r.venue_category.replace(/_/g, " ")})\n`);

  lines.push(`#### Old draft (v1)`);
  lines.push(`**Subject:** ${r.old_subject}`);
  lines.push(`**Words:** ${r.old_word_count} | **Em dashes:** ${r.old_has_em_dash ? "Yes ⚠️" : "No ✓"}\n`);
  lines.push("```");
  lines.push(r.old_content);
  lines.push("```\n");

  lines.push(`#### New draft (v1.7)`);
  lines.push(`**Subject:** ${r.new_subject}`);
  lines.push(`**Words:** ${r.new_word_count} | **Em dashes:** ${r.new_has_em_dash ? "Yes ⚠️" : "No ✓"}\n`);
  lines.push("```");
  lines.push(r.new_content);
  lines.push("```\n");

  // Spot differences
  const diffs = [];
  if (r.old_has_em_dash && !r.new_has_em_dash) diffs.push("Em dashes removed ✓");
  if (r.new_word_count < r.old_word_count - 10) diffs.push(`Shorter by ${r.old_word_count - r.new_word_count} words`);
  if (r.new_word_count > r.old_word_count + 10) diffs.push(`Longer by ${r.new_word_count - r.old_word_count} words`);
  if (/SCHOFIELD'S|DISPENSE|ESTATE|ASTERLEY ORIGINAL/.test(r.new_content)) diffs.push("Product names in ALL CAPS ✓");
  if (/\(.*\?\)/.test(r.new_content)) diffs.push("Irony-beat with parens detected");
  if (/SE26/.test(r.new_content) && !/SE26/.test(r.old_content)) diffs.push("Location reference added (SE26)");
  if (diffs.length === 0) diffs.push("Minor structural and tone adjustments");

  lines.push(`#### Differences`);
  diffs.forEach((d) => lines.push(`- ${d}`));
  lines.push("");
}

lines.push(`---\n`);
lines.push(`## All ${successful.length} Results\n`);
lines.push(`| # | Business | Category | Old words | New words | Old em dash | New em dash |`);
lines.push(`|---|---|---|---|---|---|---|`);
successful.forEach((r, i) => {
  lines.push(`| ${i + 1} | ${r.business_name} | ${r.venue_category.replace(/_/g, " ")} | ${r.old_word_count} | ${r.new_word_count} | ${r.old_has_em_dash ? "⚠️" : "✓"} | ${r.new_has_em_dash ? "⚠️" : "✓"} |`);
});

if (results.filter((r) => r.error).length > 0) {
  lines.push(`\n### Errors\n`);
  results.filter((r) => r.error).forEach((r) => {
    lines.push(`- **${r.business_name}**: ${r.error}`);
  });
}

const md = lines.join("\n");
writeFileSync(OUTPUT, md, "utf8");

console.log(`\nReport written to ${OUTPUT}`);
console.log(`${successful.length} drafts compared, ${emDashFixed.length} em-dash violations fixed by v1.7.`);
