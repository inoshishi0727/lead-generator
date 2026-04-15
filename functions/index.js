import functions from "firebase-functions/v1";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { FOLLOW_UP_LABELS, FOLLOW_UP_GAP_DAYS, shouldSkipLead, determineFollowUpAction, shouldGenerateEscalationDm } from "./followup-logic.js";

const HttpsError = functions.https.HttpsError;

initializeApp();
const db = getFirestore();

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// ---- Gemini sentiment analysis for inbound replies ----

async function analyzeSentiment(body) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !body || body.trim().length < 5) return null;

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Classify the sentiment of this email reply to a spirits/drinks sales outreach.

Reply:
"""
${body.slice(0, 1500)}
"""

Return ONLY valid JSON:
{"sentiment":"positive|negative|neutral","reason":"brief 5-10 word summary"}

Rules:
- "positive": interested, wants to learn more, requests tasting/meeting, asks for pricing
- "negative": not interested, already has supplier, asks to stop emailing, declines
- "neutral": out of office, auto-forward, asks a question without clear interest/disinterest`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { maxOutputTokens: 200, temperature: 0.1 },
    });
    let text = (response.text || "").replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (["positive", "negative", "neutral"].includes(parsed.sentiment)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Sentiment analysis failed:", err.message);
  }
  return null;
}

// ---- Venue category to lead products + tone mapping ----

const VENUE_PRODUCT_MAP = {
  cocktail_bar: { products: ["Dispense", "Schofield's"], tone: "bartender_casual" },
  wine_bar: { products: ["Estate", "Rosé", "Asterley Original"], tone: "bartender_casual" },
  italian_restaurant: { products: ["Dispense", "Asterley Original", "Estate"], tone: "warm_professional" },
  gastropub: { products: ["Dispense", "Asterley Original"], tone: "bartender_casual" },
  hotel_bar: { products: ["Schofield's", "Dispense"], tone: "warm_professional" },
  bottle_shop: { products: ["Dispense", "Schofield's"], tone: "bartender_casual" },
  deli: { products: ["Asterley Original", "Dispense"], tone: "warm_professional" },
  farm_shop: { products: ["Asterley Original", "Dispense"], tone: "warm_professional" },
  restaurant_groups: { products: ["Dispense", "Schofield's"], tone: "b2b_commercial" },
  events_catering: { products: ["Asterley Original", "Dispense"], tone: "b2b_commercial" },
  festival: { products: ["Asterley Original", "Dispense"], tone: "b2b_commercial" },
  cookery_school: { products: ["Dispense", "Schofield's"], tone: "warm_professional" },
  corporate_gifting: { products: ["Asterley Original", "Dispense"], tone: "b2b_commercial" },
  membership_club: { products: ["Dispense", "Schofield's", "Asterley Original"], tone: "warm_professional" },
  airline: { products: ["Schofield's", "Asterley Original"], tone: "corporate_formal" },
  luxury_retail: { products: ["Dispense", "Schofield's"], tone: "corporate_formal" },
  grocery: { products: ["Asterley Original", "Schofield's"], tone: "b2b_commercial" },
  pub: { products: ["RED", "Estate"], tone: "bartender_casual" },
  brewery_taproom: { products: ["Asterley Original", "Dispense"], tone: "bartender_casual" },
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
    serves: {
      "Schofield's": "White Negroni",
      "Rosé": "Rosé Americano",
      "Asterley Original": "Classic Spritz (or an Orchard Spritz with cider)",
      "Dispense": "Spiced Ginger Spritz (with lime, topped with Ginger Ale)",
      "Estate": "Cherry Americano",
      "Britannica": "Industry Sour",
    },
    hook: "Spring menus",
  },
  "High Summer": {
    lead: ["Asterley Original", "Rosé", "Dispense"],
    serves: {
      "Asterley Original": "Classic Spritz",
      "Rosé": "Rosé Spritz with Prosecco",
      "Dispense": "Spiced Ginger Spritz",
      "Schofield's": "Schofield's & Elderflower Tonic",
      "Estate": "Estate Spritz with soda and orange",
      "Britannica": "Britannica & Cola",
    },
    hook: "terrace season",
  },
  "Autumn/Winter": {
    lead: ["Estate", "Dispense", "Britannica", "Asterley Original"],
    serves: {
      "Estate": "Classic Negroni (or a Manhattan)",
      "Dispense": "Digestivo neat or over ice",
      "Britannica": "Toronto with rye (or a Hanky Panky)",
      "Schofield's": "Classic Gin Martini",
      "Asterley Original": "Pink Negroni",
      "Rosé": "Rosé Manhattan",
    },
    hook: "Autumn/Winter menus",
  },
  "January (low ABV focus)": {
    lead: ["Schofield's", "Estate", "Dispense"],
    serves: {
      "Schofield's": "Reverse Martini (Vermouth-led, low ABV)",
      "Estate": "Americano (with Dispense and soda)",
      "Dispense": "Americano (with Estate and soda)",
      "Asterley Original": "Low ABV Spritz",
      "Rosé": "Rosé Americano",
      "Britannica": "Hanky Panky",
    },
    hook: "low ABV menus",
  },
};

// ---- Step instructions ----

const STEP_INSTRUCTIONS = {
  1: `STEP 1 — Initial (The Opener). Under 80 words. New thread.
Structure:
1. Greeting
2. 1-2 sentences: Who we are + why we're writing. Direct, warm, genuine.
3. [blank line] 1 sentence: Early CTA. "Can I send some samples?" or "Can I pop in one afternoon with some samples?"
4. [blank line] 2-3 sentences: Product detail. Specific product, specific serve, why it's relevant. This is the substance.
5. 1-2 sentences: Venue/brand observation IF genuinely interesting. Woven in naturally, NOT front-loaded flattery.
6. 1 sentence: Closing CTA. "When's a good time to catch you?" / "When's good?"
7. [blank line] Sign-off only ("Cheers," or "All the best,"). Do NOT add name, company, or URL — the HTML signature handles that.

Two CTAs: soft early ("Can I send samples?") + direct close ("When's good?").
Reference something specific about their venue: a cocktail on their menu, a recent Instagram post, their vibe, their approach to aperitivo.
One line about English vermouth as a concept — don't explain, just intrigue.
Coming from Rob as co-founder changes the dynamic. Lean into it: "My brother and I make English vermouth in South London."`,

  2: `STEP 2 — 1st Follow Up (The Value Touch). Under 100 words. New subject line (NOT "Re:").
Angle: Social proof, data, or seasonal opportunity. Choose whichever is most relevant:
- Social proof: "We just got listed at [notable venue] — their bar manager said it's changed their Negroni"
- Data or trend: Share a vermouth trend stat or aperitivo insight they'd find interesting
- Seasonal opportunity: Use the SEASON and Seasonal hook provided above. Lead with that moment — "Summer menus are being built right now — English vermouth in a Spritz is turning heads"
- Credibility: Drop a specific stockist name they'll respect
Prefer the seasonal angle when the hook is strong and timely.
Do NOT re-introduce who we are. The reader should already know from the initial email.
Restate CTA briefly: "Happy to send samples. Let me know."`,

  3: `STEP 3 — 2nd Follow Up (The Content Share). Under 80 words. Same thread. Subject: "Re: {previous_subject}"
Angle: Give, don't ask. Share something genuinely useful — NOT an Asterley sales doc.
Options:
- A piece about aperitivo trends in the UK
- A cocktail recipe featuring English vermouth
- An article about vermouth's role in modern menus
The message is 2 lines max: "Thought you might find this interesting. No ask — just sharing."
Do NOT re-introduce who we are. Do NOT pitch product.`,

  4: `STEP 4 — 3rd Follow Up (The Soft Close). Under 80 words. Subject: "Re: {previous_subject}"
This is the LAST email in the sequence. Keep it very short and respectful.
- Acknowledge this is the last message for now
- Make the CTA frictionless: "I'll have a sample box sent to [venue name] this week if you text me the delivery address. No commitment."
- No pressure language
- Leave the door open: "We'll be back in touch when we've got something seasonal to share"
Never guilt-trip. No "I haven't heard back" or "I'm sure you're busy." Tone: gracious.`,

  5: `STEP 5 — Re-engagement (After 90 Days). Under 100 words. Fresh subject line (NOT "Re:").
It's been 3 months since we last touched base. Warm, low-pressure tone. Acknowledge the silence naturally.
- Brief re-introduction: "We caught up a few months back about Asterley Bros — wanted to check in as things have evolved"
- Something genuinely new: New seasonal product, recent stockist win, updated menu concept, or timely angle
- Frictionless CTA: "If you're curious, happy to send samples over. Let me know."
- No guilt or apology language
- Tone: friendly peer reconnecting, not sales pressure
Signal that this is a fresh start, not a continuation of the previous thread.`,
};

// ---- Instagram Escalation Prompt ----

const INSTAGRAM_ESCALATION_PROMPT = `INSTAGRAM DM — Channel Escalation. Under 80 words.
You emailed them a few days ago but haven't heard back. This is a short, casual DM — not a sales pitch.
- Reference the email very briefly: "Dropped you an email recently about Asterley Bros vermouth"
- Keep it warm and low-friction: "Thought I'd try here in case email got buried!"
- Short CTA: "Happy to chat or send samples over. Just drop me a line."
- Sound like a real person sliding into DMs, not a bot.
- No formal sign-off needed. Conversational tone.`;

// ---- Prompt Rules Cache ----

const RULES_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _rulesCache = { rules_md: "", fetched_at: 0 };

/**
 * Fetch the active prompt rules from Firestore.
 * Follows the pointer pattern: prompt_config/email_rules -> versions/{version_id}
 */
async function getPromptRules() {
  // Return cached rules if still fresh
  if (Date.now() - _rulesCache.fetched_at < RULES_CACHE_TTL_MS) {
    return _rulesCache.rules_md;
  }

  try {
    // Read pointer doc to find active version
    const pointerSnap = await db.collection("prompt_config").doc("email_rules").get();
    if (!pointerSnap.exists) {
      _rulesCache = { rules_md: "", fetched_at: Date.now() };
      return "";
    }

    const { active_version_id } = pointerSnap.data();
    if (!active_version_id) {
      _rulesCache = { rules_md: "", fetched_at: Date.now() };
      return "";
    }

    // Read active version doc
    const versionSnap = await db
      .collection("prompt_config")
      .doc("email_rules")
      .collection("versions")
      .doc(active_version_id)
      .get();

    const rules_md = versionSnap.exists ? (versionSnap.data().rules_md || "") : "";
    _rulesCache = { rules_md, fetched_at: Date.now() };
    return rules_md;
  } catch (err) {
    console.warn("Failed to fetch prompt rules:", err.message);
    _rulesCache = { rules_md: "", fetched_at: Date.now() };
    return "";
  }
}

// ---- Email system prompt ----

const EMAIL_SYSTEM_PROMPT = `You are Rob, founder of Asterley Bros, an independent English Vermouth, Amaro, and Aperitivo producer based in SE26, London. You are writing cold outreach emails to potential stockists.

YOUR VOICE: Bartender-to-bartender. Warm, punchy, enthusiastic, direct. Not corporate. Not salesy.
- Use genuine enthusiasm: "delicious," "banging," "brilliant," "gorgeous," "amazing"
- Use sentence fragments and loose grammar. It should read like a person wrote it, not a marketing team.
- Use parenthetical asides for personality: "(and a banging White Negroni too!)"
- Use exclamation marks when genuine. Not every sentence, but when the enthusiasm is real.
- Use colons, full stops, or new sentences for emphasis. NEVER use em dashes or en dashes.

PRODUCT NAMES are title case (capitalise first letter only): Schofield's, Dispense, Estate, Britannica, Rosé, Red, Asterley Original.
"Vermouth" and "Amaro" are capitalised as proper nouns.

PRODUCT REFERENCE:
- Schofield's: English Dry Vermouth, 16%. Created with bartenders Joe and Daniel Schofield. Crisp, herbaceous. the ultimate Dry Martini (and a banging White Negroni too!).
- Estate: English Sweet Vermouth, 16%. Rich, full-bodied. The go-to for Negronis. Brilliant in Manhattans.
- Rosé: Rosé Vermouth, 15%. Value-conscious, strong in BiB. Rosé Americano, Rosé Spritz.
- RED: Value sweet vermouth, 15%. For high-volume venues, pubs. Solid Negroni at a keen price.
- Asterley Original: British Aperitivo, 12%. Bright, citrusy. Brilliant Campari alternative. Makes a cracking Spritz. Does NOT go in classic Negronis (that needs Dispense or Estate).
- Dispense: Modern British Amaro, 26%. Flagship. 24 botanicals. Pinot Noir base. Primarily a digestivo. Spiced Ginger Spritz (with lime, topped with Ginger Ale) for summer.
- Britannica: London Fernet, 40%. Bold, complex, minty. Hanky Panky. Toronto with rye.

CRITICAL: Dispense (amaro, 26%) goes into Negronis, Boulevardiers, Americanos. Asterley Original (aperitivo, 12%) goes into Spritzes, Pink Negronis, lighter twists. They are NOT interchangeable.

VENUE-SPECIFIC MESSAGING:
- Pubs: Keep it simple. Lead with RED or Estate, not cocktail-bar products. Focus on simple serves (Negroni, Spritz, highball). No cocktail programme language. Think "something a bit different for the drinks list" not "for your cocktail menu."
- Brewery taprooms: These are NOT cocktail bars. Focus on sessionable, easy serves (Spritz, highball with ginger ale). Frame as "something different alongside your beers" not cocktail language.

PERSONALISATION RULES:
- You CAN reference: things from their website, Instagram, press features, Google reviews, menu items visible online, events they're running.
- You MUST NOT: pretend you've visited the venue or tasted their drinks. Always use honest framing: "I saw on your site," "came across on IG," "saw the TimeOut piece."
- Menu drinks: ONLY mention if genuinely unusual (not Negroni/Martini/Spritz/G&T/Espresso Martini/Old Fashioned). Write in sentence case: "your Rhubarb sour," "your Milk punch." Say "sounds great. Would love to try that."
- If nothing genuinely interesting on the menu, say NOTHING about the venue or menu.

VISIT TIMING: When suggesting dropping in, frame it for a quieter time. Never weekends. Suggest weekday afternoons, before the rush. "Pop in one afternoon," "swing by before the rush," "catch you on a quiet weekday."

CONTACT NAMES: Use first name ONLY if contact_confidence is "verified" or "likely." Otherwise "Hi team" or "Hi there."

LOCATION: Always say "SE26" or "based in SE26" (not "SE London").
London venues: suggest popping in with samples. Outside London: suggest sending samples.
Say "samples" never "bottles." Say "the bar" not "your bar."

DO NOT:
- Compare to Italian or French styles. Say "mainstream styles" or "classic styles" instead.
- Compliment the venue concept, vibe, atmosphere, or approach.
- Use: "genuinely," "distinct," "unique," "versatile," "vibrant," "exceptional," "ambitious," "interesting addition," "great fit," "I noticed," "I've been admiring," "I'm familiar with," "really impressed," "your focus on," "your commitment," "curated," "artisanal," "refined," "bespoke," "handcrafted."
- Say "Would you be open to..." Say "When's good?" or "When's a good time to catch you?"
- Say "Pinot Noir grape base." Say "Pinot Noir base."
- Say "house Negroni spirit." Say "use it in their House Negroni."
- Lead with BiB in the first email. The first email is about the product and the serve.
- Add filler sentences just to hit the word count. Every sentence must carry genuine information or a clear purpose. If the email is complete at 110 words, that is better than padding to 120 with a forced sentence.
- Use "Martini Vermouth" in subject lines or body (Martini is a competing brand). Say "English Vermouth for Your Martinis" or "English Dry Vermouth."
- Say "The Martini" — use "Your Martinis" (possessive, plural) when referring to the drink a venue makes.

EMAIL STRUCTURE (follow this order exactly):

1. GREETING
2. IDENTITY + HOOK (1-2 sentences: who we are, why we're reaching out. Warm, direct, genuine.)
3. EARLY CTA on its own standalone line, with a blank line above and below. ("Can I drop in with some samples?" / "Can I swing by one afternoon with some samples?" / "I'd love you to try...")
4. PRODUCT DETAIL (2-3 sentences: specific products, serves, why they're relevant to this venue and season. Scannable.)
5. VENUE OBSERVATION (1-2 sentences: genuine, specific, woven naturally in the middle. NOT front-loaded as the opening.)
6. CLOSING CTA ("When's a good time to catch you?" / "When's good for you?" — suggest quieter times: weekday afternoons, before the rush. NEVER weekends. Rarely past 6pm.)
7. SIGN-OFF (just "Cheers," or "All the best," — nothing after it, the HTML email signature handles name and contact details)

WORD COUNT: 120-160 words. Not less than 120, not more than 160.
TWO CTAs total: one soft/early (standalone line), one direct at the closing.
Shorter paragraphs, more line breaks. Must be skimmable on a phone.

BENCHMARK EMAILS (match this voice, energy, structure, and warmth):

EMAIL A (cocktail bar, confirmed contact):
Subject: English Vermouth for the Spring menu

Hi Tom,

We're Asterley Bros, makers of English Vermouth and Amaro in SE26. I'd love you to try our Schofield's Dry Vermouth in your Martini programme and see what you think.

Can I swing by one afternoon with some samples?

Schofield's was created with bartenders Joe and Daniel Schofield. Crisp, herbaceous, distinctly British. Designed for the ultimate Martini (and a banging White Negroni too!). Quite different from the classic styles, and I think it could work really well in your Spring menu.

Saw the TimeOut piece recently and it looked great. Congrats! The whole stirred-down classics direction is exactly the kind of programme our range is made for.

I'd love to pop in, try one of your Martinis, and leave you with some samples to play with. No pitch, just a tasting.

When's a good time to catch you?

Cheers,

EMAIL B (gastropub, confirmed contact, nearby):
Subject: Local spirits for the new cocktail list

Hi Mike,

We're Asterley Bros, makers of English Vermouth and Amaro just down the road in SE26. Given your Borough Market sourcing and the British focus, I think our range could be a really natural fit for the new cocktail programme.

Happy to pop in one afternoon and bring some samples along?

Our Dispense Amaro makes a brilliant simple highball with ginger ale: sessionable, a bit different, and really easy for the team to make. Great one for a Spring menu. And if you're doing Negronis on the expanded list, our Estate Sweet Vermouth makes a gorgeous one.

Saw on Instagram you've expanded from four to twelve cocktails. That's a proper commitment and it's great to see!

When's a good time to catch you during the week?

Cheers,

EMAIL C (wine bar, owner, nearby):
Subject: English Aperitivo for the aperitivo menu?

Hi Francesca,

We're Asterley Bros, makers of English Vermouth and Amaro practically round the corner from you in SE26. I think our bottles would be a really natural fit for your aperitivo programme, especially with Spritz season kicking off.

Can I pop in one afternoon and bring some to try?

Our Asterley Original is a gorgeous British Aperitivo that's a brilliant alternative to Campari in spritzes. And Estate is our English Sweet Vermouth that could be really interesting on your vermouth tap.

Just saw you've launched the Sunday aperitivo hour and it looks brilliant. Much better to taste everything in person than go on about it over email!

When's good to catch you on a quieter day?

Cheers,

Output ONLY "Subject:" on the first line, then the full email body. Nothing else.`;

// ---- Season + prompt builder ----

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month === 1) return "January (low ABV focus)";
  if (month >= 3 && month <= 6) return "Spring/Summer";
  if (month >= 7 && month <= 8) return "High Summer";
  return "Autumn/Winter";
}

function buildPrompt(lead, enrichment, step = 1, previousSubject = "") {
  const contact = enrichment.contact || {};
  const season = getCurrentSeason();
  const seasonData = SEASONAL_PRODUCTS[season] || SEASONAL_PRODUCTS["Spring/Summer"];
  const venueCat = enrichment.venue_category || lead.category || "cocktail_bar";
  const venueConfig = VENUE_PRODUCT_MAP[venueCat] || VENUE_PRODUCT_MAP.cocktail_bar;
  const toneKey = enrichment.tone_tier || venueConfig.tone || "bartender_casual";
  const toneConfig = TONE_CONFIG[toneKey] || TONE_CONFIG.bartender_casual;

  // Determine lead product: enrichment > venue category > seasonal
  const enrichProducts = enrichment.lead_products || [];
  const leadProduct = enrichProducts[0] || venueConfig.products[0] || seasonData.lead[0];
  const secondProduct = enrichProducts[1] || venueConfig.products[1] || seasonData.lead[1] || "";
  const leadServe = seasonData.serves[leadProduct] || "ask the team what they'd make with it";
  const secondServe = secondProduct ? (seasonData.serves[secondProduct] || "") : "";

  const contactName = lead.contact_name || contact.name || "";
  const contactConf = lead.contact_confidence || contact.confidence || "uncertain";
  const greeting = (contactName && (contactConf === "verified" || contactConf === "likely"))
    ? contactName.split(" ")[0]
    : toneConfig.greeting_default;

  const isLondon = (lead.address || "").toLowerCase().includes("london") ||
    (lead.address || "").match(/\b(SE|SW|NW|NE|EC|WC|E|W|N)\d/i);

  const stepInstr = (STEP_INSTRUCTIONS[step] || STEP_INSTRUCTIONS[1])
    .replace("{previous_subject}", previousSubject);

  return `VENUE DATA:
- Name: ${lead.business_name || ""}
- Category: ${venueCat}
- Location: ${lead.address || "London"}
- Is London: ${isLondon ? "Yes" : "No"}
- Drinks on menu: ${enrichment.drinks_programme || "not available"}
- Menu URL: ${enrichment.menu_url || "not available"}
- Context notes: ${enrichment.context_notes || "none"}
- Business summary: ${enrichment.business_summary || "none"}
- Why Asterley fits: ${enrichment.why_asterley_fits || "none"}
- Menu fit: ${enrichment.menu_fit || "unknown"}

CONTACT:
- Name: ${contactName || "none"}
- Confidence: ${contactConf}
- Greeting to use: ${greeting}

TONE: ${toneKey}
- Sign-off: ${toneConfig.signoff}

SEASON: ${season}
- Seasonal hook: ${seasonData.hook}

PRODUCTS FOR THIS EMAIL:
- Lead product: ${leadProduct}
- Lead serve: ${leadServe}
- Second product (for step 2 or brackets): ${secondProduct}
- Second serve: ${secondServe}

${stepInstr}

Write the email now. Subject line first (short, specific, intriguing, 3-7 words), then the full email.`;
}

/**
 * Fetch recent edit feedback from Firestore to inject as training examples.
 * Returns up to 3 most recent edits, optionally filtered by venue_category/tone_tier.
 */
async function getEditFeedback(venueCat, toneTier, limit = 3) {
  try {
    // Try to find edits matching the same venue category first
    let snap = await db.collection("edit_feedback")
      .where("channel", "==", "email")
      .orderBy("created_at", "desc")
      .limit(20)
      .get();

    if (snap.empty) return "";

    const docs = snap.docs.map((d) => d.data());

    // Prefer matching venue_category, then tone_tier, then any
    const matched = docs.filter((d) => d.venue_category === venueCat);
    const toneMatched = docs.filter((d) => d.tone_tier === toneTier);
    const examples = matched.length >= 2 ? matched : toneMatched.length >= 2 ? toneMatched : docs;

    // Prioritize reflected edits (those with a reason note) over unreflected ones
    const reflected = examples.filter((d) => d.reflection_note);
    const unreflected = examples.filter((d) => !d.reflection_note);
    const selected = reflected.length >= limit
      ? reflected.slice(0, limit)
      : [...reflected, ...unreflected].slice(0, limit);
    if (selected.length === 0) return "";

    let block = `\nHUMAN EDIT EXAMPLES (learn from these corrections — the human edited Claude's draft to improve it):\n`;
    for (let i = 0; i < selected.length; i++) {
      const fb = selected[i];
      block += `\nExample ${i + 1}:`;
      if (fb.original_subject && fb.edited_subject && fb.original_subject !== fb.edited_subject) {
        block += `\nOriginal subject: ${fb.original_subject}`;
        block += `\nCorrected subject: ${fb.edited_subject}`;
      }
      block += `\nOriginal:\n${fb.original_content}`;
      block += `\nCorrected:\n${fb.edited_content}`;
      if (fb.reflection_note) {
        block += `\nReason for edit: ${fb.reflection_note}`;
      }
      block += "\n";
    }
    return block;
  } catch (err) {
    console.warn("Failed to fetch edit feedback:", err.message);
    return "";
  }
}

function hasEnrichment(doc) {
  const e = doc.enrichment || {};
  return !!(
    e.venue_category &&
    (e.context_notes || e.drinks_programme || e.business_summary)
  );
}

function isSnoozedOrExcluded(doc) {
  if (doc.human_takeover === true) return true;
  if (doc.client_status === "current_account") return true;
  if (doc.stage === "declined") return true;
  const snoozedUntil = doc.snoozed_until;
  if (snoozedUntil) {
    try {
      return new Date(snoozedUntil) > new Date();
    } catch {
      return false;
    }
  }
  return false;
}

// ---- Cloud Functions ----

/**
 * Generate drafts for all eligible leads (or specific lead_ids).
 * Called from frontend: generateDrafts({ lead_ids?: string[] })
 */
export const generateDrafts = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB", secrets: ["ANTHROPIC_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    // Check caller role for member-scoping
    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    const callerRole = callerSnap.exists ? callerSnap.data().role : "viewer";

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "ANTHROPIC_API_KEY not configured.");
    }

    const anthropic = new Anthropic({ apiKey });
    const leadIds = data?.lead_ids || null;

    let docs;
    if (leadIds && leadIds.length > 0) {
      // Specific leads
      const promises = leadIds.map((id) => db.collection("leads").doc(id).get());
      const snaps = await Promise.all(promises);
      docs = snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
    } else {
      // All eligible leads
      const leadsSnap = await db.collection("leads").get();
      const allDocs = leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Get existing drafts
      const msgsSnap = await db.collection("outreach_messages").get();
      const leadsWithDrafts = new Set(msgsSnap.docs.map((d) => d.data().lead_id));

      docs = allDocs.filter(
        (d) =>
          d.email &&
          hasEnrichment(d) &&
          !leadsWithDrafts.has(d.id) &&
          !isSnoozedOrExcluded(d)
      );
    }

    // Member can only generate for their own assigned leads
    if (callerRole === "member") {
      docs = docs.filter((d) => d.assigned_to === context.auth.uid);
    }

    // Batch limit to avoid timeout
    docs = docs.slice(0, 20);

    let generated = 0;
    let failed = 0;

    for (const leadDoc of docs) {
      try {
        const enrichment = leadDoc.enrichment || {};
        const venueCat = enrichment.venue_category || leadDoc.category || "cocktail_bar";
        const toneTier = enrichment.tone_tier || "bartender_casual";
        const prompt = buildPrompt(leadDoc, enrichment);

        // Inject edit feedback so Claude learns from past human corrections
        const feedbackBlock = await getEditFeedback(venueCat, toneTier);
        const promptRules = await getPromptRules();
        const systemPrompt = EMAIL_SYSTEM_PROMPT
          + (promptRules ? `\n\nPROMPT RULES (apply to every email):\n${promptRules}` : "")
          + (feedbackBlock || "");

        const response = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
        });

        let content = response.content[0].text || "";
        let subject = null;

        if (content.includes("Subject:")) {
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("Subject:")) {
              subject = lines[i].trim().replace("Subject:", "").trim();
              content = lines.slice(i + 1).join("\n").trim();
              break;
            }
          }
        }

        const contact = enrichment.contact || {};
        const msgId = crypto.randomUUID();
        await db.collection("outreach_messages").doc(msgId).set({
          id: msgId,
          lead_id: leadDoc.id,
          business_name: leadDoc.business_name,
          venue_category: enrichment.venue_category || null,
          channel: "email",
          subject,
          content,
          status: "draft",
          step_number: 1,
          follow_up_label: "initial",
          scheduled_send_date: null,
          created_at: new Date().toISOString(),
          tone_tier: enrichment.tone_tier || null,
          lead_products: enrichment.lead_products || [],
          contact_name: leadDoc.contact_name || contact.name || null,
          context_notes: enrichment.context_notes || null,
          menu_fit: enrichment.menu_fit || null,
          recipient_email: leadDoc.email || leadDoc.contact_email || null,
          website: leadDoc.website || null,
          workspace_id: leadDoc.workspace_id || "",
          assigned_to: leadDoc.assigned_to || null,
          original_content: content,
          original_subject: subject,
          was_edited: false,
        });

        await db.collection("leads").doc(leadDoc.id).update({
          stage: "draft_generated",
        });

        generated++;
      } catch (err) {
        console.error("Draft failed for", leadDoc.business_name, err.message);
        failed++;
      }
    }

    return { generated, failed, total: docs.length };
  });

/**
 * Regenerate a single draft.
 * Called from frontend: regenerateDraft({ message_id, lead_id })
 */
export const regenerateDraft = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB", secrets: ["ANTHROPIC_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "ANTHROPIC_API_KEY not configured.");
    }

    const { message_id, lead_id } = data;
    if (!message_id || !lead_id) {
      throw new HttpsError("invalid-argument", "message_id and lead_id required.");
    }

    const anthropic = new Anthropic({ apiKey });

    const leadSnap = await db.collection("leads").doc(lead_id).get();
    if (!leadSnap.exists) {
      throw new HttpsError("not-found", "Lead not found.");
    }

    const leadDoc = leadSnap.data();
    const enrichment = leadDoc.enrichment || {};
    const venueCat = enrichment.venue_category || leadDoc.category || "cocktail_bar";
    const toneTier = enrichment.tone_tier || "bartender_casual";
    const prompt = buildPrompt(leadDoc, enrichment);

    const feedbackBlock = await getEditFeedback(venueCat, toneTier);
    const promptRules = await getPromptRules();
    const systemPrompt = EMAIL_SYSTEM_PROMPT
      + (promptRules ? `\n\nPROMPT RULES (apply to every email):\n${promptRules}` : "")
      + (feedbackBlock || "");

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    let content = response.content[0].text || "";
    let subject = null;

    if (content.includes("Subject:")) {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith("Subject:")) {
          subject = lines[i].trim().replace("Subject:", "").trim();
          content = lines.slice(i + 1).join("\n").trim();
          break;
        }
      }
    }

    await db.collection("outreach_messages").doc(message_id).update({
      subject,
      content,
      status: "draft",
      created_at: new Date().toISOString(),
      original_content: content,
      original_subject: subject,
      was_edited: false,
      edited_at: null,
    });

    return { message_id, subject, content };
  });

/**
 * Regenerate ALL drafts (delete existing, create new).
 */
export const regenerateAllDrafts = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB", secrets: ["ANTHROPIC_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    // Check admin role
    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!userSnap.exists || userSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "ANTHROPIC_API_KEY not configured.");
    }

    const anthropic = new Anthropic({ apiKey });

    // Mark existing drafts as rejected
    const existingMsgs = await db.collection("outreach_messages").where("status", "==", "draft").get();
    const batch = db.batch();
    existingMsgs.docs.forEach((d) => {
      batch.update(d.ref, { status: "rejected" });
    });
    await batch.commit();

    // Get all eligible leads
    const leadsSnap = await db.collection("leads").get();
    const docs = leadsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => d.email && hasEnrichment(d) && !isSnoozedOrExcluded(d));

    let generated = 0;
    let failed = 0;

    for (const leadDoc of docs) {
      try {
        const enrichment = leadDoc.enrichment || {};
        const venueCat = enrichment.venue_category || leadDoc.category || "cocktail_bar";
        const toneTier = enrichment.tone_tier || "bartender_casual";
        const prompt = buildPrompt(leadDoc, enrichment);

        const feedbackBlock = await getEditFeedback(venueCat, toneTier);
        const promptRules = await getPromptRules();
        const systemPrompt = EMAIL_SYSTEM_PROMPT
          + (promptRules ? `\n\nPROMPT RULES (apply to every email):\n${promptRules}` : "")
          + (feedbackBlock || "");

        const response = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
        });

        let content = response.content[0].text || "";
        let subject = null;

        if (content.includes("Subject:")) {
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith("Subject:")) {
              subject = lines[i].trim().replace("Subject:", "").trim();
              content = lines.slice(i + 1).join("\n").trim();
              break;
            }
          }
        }

        const contact = enrichment.contact || {};
        const msgId = crypto.randomUUID();
        await db.collection("outreach_messages").doc(msgId).set({
          id: msgId,
          lead_id: leadDoc.id,
          business_name: leadDoc.business_name,
          venue_category: enrichment.venue_category || null,
          channel: "email",
          subject,
          content,
          status: "draft",
          step_number: 1,
          follow_up_label: "initial",
          scheduled_send_date: null,
          created_at: new Date().toISOString(),
          tone_tier: enrichment.tone_tier || null,
          lead_products: enrichment.lead_products || [],
          contact_name: leadDoc.contact_name || contact.name || null,
          context_notes: enrichment.context_notes || null,
          menu_fit: enrichment.menu_fit || null,
          menu_url: enrichment.menu_url || null,
          recipient_email: leadDoc.email || leadDoc.contact_email || null,
          website: leadDoc.website || null,
          workspace_id: leadDoc.workspace_id || "",
          assigned_to: leadDoc.assigned_to || null,
          original_content: content,
          original_subject: subject,
          was_edited: false,
        });

        await db.collection("leads").doc(leadDoc.id).update({
          stage: "draft_generated",
        });

        generated++;
      } catch (err) {
        console.error("Regenerate failed for", leadDoc.business_name, err.message);
        failed++;
      }
    }

    return { generated, failed, total: docs.length };
  });

// ---- Outreach Plan ----

const SEASONS = {
  spring_summer: { months: [3,4,5,6], products: ["Asterley Original","Schofield's","Rosé","Dispense"], hook: "Spring/Summer menus", serves: "Spritzes, White Negronis, highballs" },
  high_summer: { months: [7,8], products: ["Asterley Original","Rosé","Red"], hook: "terrace season", serves: "Spritzes, long drinks, pre-batched Negronis" },
  autumn_winter: { months: [9,10,11,12,2], products: ["Estate","Dispense","Britannica","Asterley Original"], hook: "Autumn/Winter menus", serves: "Negronis, Manhattans, digestivos" },
  january: { months: [1], products: ["Schofield's","Estate","Dispense"], hook: "Dry January / low ABV", serves: "Reverse Martini, Americano, low ABV Spritzes" },
};

const SEASONAL_CAT_PRIORITY = {
  spring_summer: { cocktail_bar:10, wine_bar:9, hotel_bar:8, italian_restaurant:8, bottle_shop:7, gastropub:6, restaurant_groups:5, pub:5, brewery_taproom:5 },
  high_summer: { gastropub:10, hotel_bar:9, cocktail_bar:8, wine_bar:7, pub:8, brewery_taproom:7 },
  autumn_winter: { cocktail_bar:10, hotel_bar:9, italian_restaurant:9, wine_bar:8, restaurant_groups:7, pub:5, brewery_taproom:4 },
  january: { wine_bar:10, cocktail_bar:9, hotel_bar:8, gastropub:7, bottle_shop:6, pub:4, brewery_taproom:3 },
};

function getSeason() {
  const m = new Date().getMonth() + 1;
  for (const [name, cfg] of Object.entries(SEASONS)) {
    if (cfg.months.includes(m)) return name;
  }
  return "spring_summer";
}

function getSendWindow() {
  const now = new Date();
  const wd = now.getDay(); // 0=Sun
  const BEST = [2,3,4]; // Tue,Wed,Thu
  if (BEST.includes(wd) && now.getHours() >= 10 && now.getHours() < 13) {
    return { status: "now", label: "Right now", day: now.toLocaleDateString("en",{weekday:"long"}), time: "10am-1pm" };
  }
  for (let i = 1; i < 8; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    if (BEST.includes(d.getDay())) {
      return { status: "upcoming", label: `${d.toLocaleDateString("en",{weekday:"long"})} 10am-1pm`, day: d.toLocaleDateString("en",{weekday:"long"}), time: "10am-1pm" };
    }
  }
  return { status: "upcoming", label: "Tuesday 10am-1pm", day: "Tuesday", time: "10am-1pm" };
}

export const getOutreachPlan = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB", secrets: ["GEMINI_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const limit = data?.limit || 10;
    const leadsSnap = await db.collection("leads").get();
    const docs = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const season = getSeason();
    const seasonCfg = SEASONS[season];
    const catPriority = SEASONAL_CAT_PRIORITY[season] || {};
    const sendWindow = getSendWindow();

    if (!docs.length) {
      return { season, seasonal_hook: seasonCfg.hook, seasonal_products: seasonCfg.products, seasonal_serves: seasonCfg.serves, send_window: sendWindow, ai_summary: null, recommended: [], total_eligible: 0, weekly_target: 100, weekly_progress: { total: 0, remaining: 100, by_category: {} }, generated_at: new Date().toISOString() };
    }

    // Score ALL leads — don't gate on email
    const scoredLeads = [];
    const categoryCounts = {};
    for (const lead of docs) {
      const stage = lead.stage || "";
      if (["sent","follow_up_1","follow_up_2","responded","converted","declined"].includes(stage)) continue;

      const e = lead.enrichment || {};
      const venueCat = e.venue_category || lead.category || "other";
      const menuFit = e.menu_fit || "unknown";
      const leadProducts = e.lead_products || [];
      const contact = e.contact || {};

      categoryCounts[venueCat] = (categoryCounts[venueCat] || 0) + 1;

      let priority = 0;
      const reasons = [];

      // Boost leads that have email (ready to contact)
      if (lead.email) priority += 15;

      const catScore = catPriority[venueCat] || 2;
      priority += catScore * 3;
      if (catScore >= 8) reasons.push(`${venueCat.replace(/_/g," ")} is high-priority for ${seasonCfg.hook}`);

      if (menuFit === "strong") { priority += 20; reasons.push("Strong menu fit"); }
      else if (menuFit === "moderate") { priority += 10; }

      if (e.enrichment_status === "success") { priority += 10; if (e.why_asterley_fits) reasons.push(e.why_asterley_fits); }

      const seasonalProducts = new Set(seasonCfg.products);
      const overlap = leadProducts.filter(p => seasonalProducts.has(p));
      if (overlap.length) { priority += overlap.length * 5; reasons.push(`Seasonal: ${overlap.join(", ")}`); }

      const score = lead.score;
      if (score > 60) priority += 15;
      else if (score > 40) priority += 8;

      if (contact.name) { priority += 5; reasons.push(`Contact: ${contact.name}`); }

      scoredLeads.push({
        lead_id: lead.id,
        business_name: lead.business_name || "",
        venue_category: venueCat,
        email: lead.email || null,
        priority,
        reasons: reasons.slice(0, 3),
        lead_products: overlap.length ? overlap : leadProducts.slice(0, 2),
        seasonal_hook: seasonCfg.hook,
        suggested_serves: seasonCfg.serves,
        contact_name: contact.name || lead.contact_name || null,
        menu_fit: menuFit,
        score: score || null,
      });
    }

    scoredLeads.sort((a, b) => b.priority - a.priority);
    const topLeads = scoredLeads.slice(0, limit);

    // Generate AI weekly focus summary via Gemini
    let aiSummary = null;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && topLeads.length > 0) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const catBreakdown = Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, count]) => `${cat.replace(/_/g, " ")}: ${count}`)
          .join(", ");

        const topLeadSummary = topLeads.slice(0, 5).map(l =>
          `${l.business_name} (${l.venue_category.replace(/_/g, " ")}${l.menu_fit !== "unknown" ? `, ${l.menu_fit} fit` : ""})`
        ).join("; ");

        const prompt = `You are the sales strategist for Asterley Bros (English Vermouth, Amaro & Aperitivo, SE London).

Season: ${season.replace(/_/g, " ")}
Seasonal hook: ${seasonCfg.hook}
Seasonal products: ${seasonCfg.products.join(", ")}
Best serves right now: ${seasonCfg.serves}
Total active leads: ${scoredLeads.length}
With email: ${scoredLeads.filter(l => l.email).length}
Category breakdown: ${catBreakdown}
Top leads this week: ${topLeadSummary}

Write a 2-3 sentence weekly outreach briefing for Rob (founder). Be specific:
- Which venue category to prioritise this week and why (tie to season/timing)
- Which product to lead with
- One tactical tip based on the actual lead mix

Keep it punchy and actionable. No fluff. Write as a strategist briefing, not marketing copy.
Do NOT use markdown, bold, headers, or bullet points. Plain text only.`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
        });
        aiSummary = response.text || null;
      } catch (err) {
        console.error("AI summary generation failed:", err.message);
      }
    }

    return {
      season,
      seasonal_hook: seasonCfg.hook,
      seasonal_products: seasonCfg.products,
      seasonal_serves: seasonCfg.serves,
      send_window: sendWindow,
      ai_summary: aiSummary,
      total_eligible: scoredLeads.length,
      recommended: topLeads,
      weekly_target: 100,
      weekly_progress: { total: docs.length, remaining: Math.max(0, 100 - docs.length), by_category: categoryCounts },
      generated_at: new Date().toISOString(),
    };
  });

// ---- AI Strategy Recommendations ----

const STRATEGY_PROMPT = `You are a sales strategy advisor for Asterley Bros, an English Vermouth, Amaro, and Aperitivo producer in SE London.

Analyze these lead generation statistics and provide actionable recommendations.

Current lead distribution by venue category:
{category_stats}

Overall metrics:
- Total leads: {total_leads}
- Average score: {avg_score}
- Response rate: {response_rate}%
- Conversion rate: {conversion_rate}%

Return a JSON object with:
{
  "insights": [{"title":"headline","description":"explanation","action":"action to take","priority":"high/medium/low","category":"venue_category or null"}],
  "ratio_adjustments": [{"category":"venue_category","current_ratio":0.10,"recommended_ratio":0.20,"reason":"why"}],
  "query_suggestions": ["search query 1", "query 2"]
}

Provide 3-5 insights. Return ONLY valid JSON.`;

export const getStrategy = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB", secrets: ["GEMINI_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new HttpsError("failed-precondition", "GEMINI_API_KEY not configured.");

    const ai = new GoogleGenAI({ apiKey });
    const leadsSnap = await db.collection("leads").get();
    const docs = leadsSnap.docs.map((d) => d.data());
    const total = docs.length;
    const scores = docs.filter((d) => d.score != null).map((d) => d.score);
    const avgScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
    const sent = docs.filter((d) => ["sent","follow_up_1","follow_up_2","responded","converted","declined"].includes(d.stage)).length;
    const responded = docs.filter((d) => ["responded","converted"].includes(d.stage)).length;
    const converted = docs.filter((d) => d.stage === "converted").length;

    const byCategory = {};
    for (const doc of docs) {
      const cat = (doc.enrichment || {}).venue_category || "other";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(doc);
    }
    const categoryLines = Object.entries(byCategory)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([cat, catDocs]) => {
        const s = catDocs.filter(d => ["sent","follow_up_1","follow_up_2","responded","converted","declined"].includes(d.stage)).length;
        return `- ${cat}: ${catDocs.length} leads, ${s} sent`;
      });

    const prompt = STRATEGY_PROMPT
      .replace("{category_stats}", categoryLines.join("\n"))
      .replace("{total_leads}", String(total))
      .replace("{avg_score}", String(avgScore))
      .replace("{response_rate}", String(sent > 0 ? Math.round(responded/sent*100) : 0))
      .replace("{conversion_rate}", String(total > 0 ? Math.round(converted/total*100) : 0));

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash", contents: prompt,
        config: { maxOutputTokens: 1500, temperature: 0.3 },
      });
      const text = response.text || "";
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(text.slice(start, end + 1));
        parsed.generated_at = new Date().toISOString();
        return parsed;
      }
    } catch (err) {
      console.error("Strategy failed:", err.message);
    }
    return { insights: [], ratio_adjustments: [], query_suggestions: [], generated_at: new Date().toISOString() };
  });

// ---- Send Approved Emails via Resend ----

const SENDER_EMAIL = "rob@asterleybros.com";
const SENDER_NAME = "Rob from Asterley Bros";
const DAILY_CAP = 150;

// HTML email signature — appended at send time, not stored in message content.
// Duplicated in src/outreach/email_sender.py and frontend/src/app/api/outreach/send/route.ts.
const EMAIL_SIGNATURE_HTML = `\
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333;">
  <tr>
    <td style="padding-top: 12px; border-top: 1px solid #ddd;">
      <strong>Robert Berry</strong>&nbsp;&nbsp;|&nbsp;&nbsp;Co-founder<br>
      <a href="tel:+447817478196" style="color: #333; text-decoration: none;">+44 7817 478196</a><br>
      <a href="https://www.asterleybros.com" style="color: #b5651d; text-decoration: none;">www.asterleybros.com</a>
    </td>
  </tr>
  <tr>
    <td style="padding-top: 10px;">
      <img src="https://cdn.shopify.com/s/files/1/0447/7521/1172/files/Awards_Only_SML.png?v=1774997201"
           alt="Asterley Bros Awards" width="300" style="display: block;" />
    </td>
  </tr>
</table>`;

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlEmail(content) {
  const escaped = escapeHtml(content);
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;"><div style="white-space: pre-wrap;">${escaped}</div><br>${EMAIL_SIGNATURE_HTML}</div>`;
}

// UK bank holidays (England & Wales) for 2026-2027.
// Update annually or fetch from https://www.gov.uk/bank-holidays.json
const UK_BANK_HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25",
  "2026-08-31", "2026-12-25", "2026-12-28",
  // 2027
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31",
  "2027-08-30", "2027-12-27", "2027-12-28",
]);

/**
 * Check if a given date (London time) is a blackout day for outreach.
 * Blackout = weekends, UK bank holidays, Dec 24 - Jan 3.
 */
function isBlackoutDay(londonDate) {
  const day = londonDate.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return true;

  const month = londonDate.getMonth(); // 0-indexed
  const date = londonDate.getDate();

  // Dec 24-31
  if (month === 11 && date >= 24) return true;
  // Jan 1-3
  if (month === 0 && date <= 3) return true;

  // Bank holidays
  const iso = londonDate.toISOString().split("T")[0];
  if (UK_BANK_HOLIDAYS.has(iso)) return true;

  return false;
}

/**
 * Is now within the optimal send window?
 * Per proposal: Tue-Thu, 9-11am London time, no blackout days.
 */
function isOptimalWindow() {
  const now = new Date();
  const london = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));

  if (isBlackoutDay(london)) return false;

  const day = london.getDay();
  const hour = london.getHours();
  const isBestDay = [2, 3, 4].includes(day); // Tue, Wed, Thu
  const isBestTime = hour >= 9 && hour < 11; // 9-11am per proposal
  return isBestDay && isBestTime;
}

const REPLY_DOMAIN = "replies.asterleybros.com";

export const sendApproved = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB", secrets: ["RESEND_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    const senderRole = userSnap.exists ? userSnap.data().role : "viewer";
    if (!["admin", "member"].includes(senderRole)) {
      throw new HttpsError("permission-denied", "Admin or member only.");
    }

    // Optimal window check
    if (!data?.force && !isOptimalWindow()) {
      return {
        status: "warning",
        outside_optimal_window: true,
        sent: 0,
        failed: 0,
        total: 0,
      };
    }

    // Daily cap check
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const sentTodaySnap = await db.collection("outreach_messages")
      .where("status", "==", "sent")
      .where("sent_at", ">=", todayMidnight.toISOString())
      .get();

    if (sentTodaySnap.size >= DAILY_CAP) {
      throw new HttpsError("resource-exhausted", `Daily cap of ${DAILY_CAP} emails reached.`);
    }

    const remaining = DAILY_CAP - sentTodaySnap.size;

    // Get messages to send
    const messageIds = data?.message_ids || null;
    let messages;

    if (messageIds && messageIds.length > 0) {
      // Send specific messages
      const promises = messageIds.map((id) => db.collection("outreach_messages").doc(id).get());
      const snaps = await Promise.all(promises);
      messages = snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
    } else {
      // Send all approved emails
      const approvedSnap = await db.collection("outreach_messages")
        .where("status", "==", "approved")
        .where("channel", "==", "email")
        .get();
      messages = approvedSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    // Member can only send their own assigned messages
    if (senderRole === "member") {
      messages = messages.filter((m) => m.assigned_to === context.auth.uid);
    }

    if (!messages.length) {
      return { status: "completed", sent: 0, failed: 0, total: 0 };
    }

    const toSend = messages.slice(0, remaining);

    // Init Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new HttpsError("failed-precondition", "RESEND_API_KEY not configured.");
    const resend = new Resend(apiKey);

    let sent = 0;
    let failed = 0;

    for (const msg of toSend) {
      // Skip non-email channels (e.g., instagram_dm) — manual send only
      if (msg.channel !== "email") {
        console.log(`SKIP [${msg.business_name}]: channel "${msg.channel}" is not auto-sent`);
        continue;
      }

      let sendFailed = false; // Track if actual send failed vs pre-send error (Bug #14)
      try {
        // Get lead to find recipient email
        const leadSnap = await db.collection("leads").doc(msg.lead_id).get();
        if (!leadSnap.exists) {
          console.error("Lead not found for message", msg.id);
          failed++;
          continue;
        }

        const lead = leadSnap.data();
        const toEmail = lead.contact_email || lead.email;
        if (!toEmail) {
          console.error("No email for lead", msg.lead_id, lead.business_name);
          failed++;
          continue;
        }

        // Encode lead_id in reply-to so inbound webhook can match replies
        const replyToAddress = `reply+${msg.lead_id}@${REPLY_DOMAIN}`;

        // Thread follow-ups as replies in the same conversation
        const sendHeaders = {};
        if (msg.step_number > 1) {
          // Strategy 1: Use inbound reply's RFC Message-ID (same approach as sendReply)
          const repliesSnap = await db.collection("inbound_replies")
            .where("lead_id", "==", msg.lead_id)
            .get();
          const inboundReplies = repliesSnap.docs
            .map((d) => d.data())
            .filter((d) => d.direction !== "outbound" && d.rfc_message_id)
            .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));

          if (inboundReplies.length > 0) {
            sendHeaders["In-Reply-To"] = inboundReplies[0].rfc_message_id;
            sendHeaders["References"] = inboundReplies[0].rfc_message_id;
            console.log("Threading follow-up (via inbound reply) for", lead.business_name, "with", inboundReplies[0].rfc_message_id);
          } else {
            // Strategy 2: No replies yet — build References chain from all prior sent messages (Bug #9)
            const priorMessagesSnap = await db.collection("outreach_messages")
              .where("lead_id", "==", msg.lead_id)
              .where("status", "==", "sent")
              .get();
            const priorMessages = priorMessagesSnap.docs
              .map((d) => d.data())
              .filter((m) => m.email_message_id && (m.step_number ?? 1) < (msg.step_number ?? 1))
              .sort((a, b) => (a.step_number ?? 1) - (b.step_number ?? 1));

            if (priorMessages.length > 0) {
              const rfcChain = priorMessages
                .map((m) => m.email_message_id.includes("@") ? `<${m.email_message_id}>` : `<${m.email_message_id}@resend.dev>`)
                .join(" ");
              const lastMessageId = priorMessages[priorMessages.length - 1].email_message_id;
              const lastRfc = lastMessageId.includes("@") ? `<${lastMessageId}>` : `<${lastMessageId}@resend.dev>`;
              sendHeaders["In-Reply-To"] = lastRfc;
              sendHeaders["References"] = rfcChain;
              console.log("Threading follow-up (via chain) for", lead.business_name, "with", rfcChain);
            }
          }
        }

        // Mark that we're about to send, so errors after this are actual send failures (Bug #14)
        sendFailed = true;
        const { data: resendData, error } = await resend.emails.send({
          from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
          to: toEmail,
          replyTo: replyToAddress,
          subject: msg.subject || "Asterley Bros",
          text: msg.content,
          html: buildHtmlEmail(msg.content),
          ...(Object.keys(sendHeaders).length > 0 ? { headers: sendHeaders } : {}),
        });

        if (error) throw new Error(error.message);

        const now = new Date().toISOString();
        await db.collection("outreach_messages").doc(msg.id).update({
          status: "sent",
          sent_at: now,
          reply_to_address: replyToAddress,
          email_message_id: resendData?.id ?? null,
        });

        // Set the correct stage based on step number
        const sentStepNumber = msg.step_number ?? 1;
        const newLeadStage = sentStepNumber === 1 ? "sent"
          : sentStepNumber === 2 ? "follow_up_1"
          : "follow_up_2";
        await db.collection("leads").doc(msg.lead_id).update({
          stage: newLeadStage,
        });

        // Create a planned card for the next step (guard against duplicates)
        const nextStep = sentStepNumber + 1;
        if (nextStep <= 5) {
          const existingNextStep = await db.collection("outreach_messages")
            .where("lead_id", "==", msg.lead_id)
            .where("step_number", "==", nextStep)
            .where("status", "in", ["planned", "draft", "approved", "sent"])
            .limit(1)
            .get();
          if (!existingNextStep.empty) {
            console.log(`Planned card for step ${nextStep} already exists for ${lead.business_name}, skipping`);
          } else {
          const sentDate = new Date(now);
          const scheduledDate = new Date(sentDate);
          scheduledDate.setDate(scheduledDate.getDate() + FOLLOW_UP_GAP_DAYS[nextStep]);
          const scheduledSendDate = scheduledDate.toISOString().split("T")[0];
          const plannedId = crypto.randomUUID();
          await db.collection("outreach_messages").doc(plannedId).set({
            id: plannedId,
            lead_id: msg.lead_id,
            business_name: msg.business_name,
            venue_category: msg.venue_category || null,
            channel: "email",
            subject: null,
            content: "",
            status: "planned",
            step_number: nextStep,
            follow_up_label: FOLLOW_UP_LABELS[nextStep],
            scheduled_send_date: scheduledSendDate,
            created_at: new Date().toISOString(),
            tone_tier: msg.tone_tier || null,
            lead_products: msg.lead_products || [],
            contact_name: msg.contact_name || null,
            context_notes: msg.context_notes || null,
            menu_fit: msg.menu_fit || null,
            recipient_email: msg.recipient_email || lead.email || lead.contact_email || null,
            website: msg.website || null,
            workspace_id: msg.workspace_id || "",
            assigned_to: msg.assigned_to || null,
            was_edited: false,
            parent_email_message_id: resendData?.id ?? null,
          });
          }
        }

        sent++;
        console.log("Sent to", toEmail, "for", lead.business_name);
      } catch (err) {
        console.error("Send failed for", msg.id, err.message);
        // Only mark bounced if the send itself failed, not pre-send validation (Bug #14)
        if (sendFailed) {
          await db.collection("outreach_messages").doc(msg.id).update({
            status: "bounced",
          });
        }
        failed++;
      }
    }

    return { status: "completed", sent, failed, total: toSend.length };
  });

// ---- Reply to Inbound Email ----

/**
 * Send a reply from the UI as Rob. Threads properly in the recipient's inbox.
 * Called from frontend: sendReply({ lead_id, message_id, content })
 */
export const sendReply = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB", secrets: ["RESEND_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!userSnap.exists || userSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const { lead_id, message_id, content } = data || {};
    if (!lead_id || !message_id || !content?.trim()) {
      throw new HttpsError("invalid-argument", "lead_id, message_id, and content are required.");
    }

    // Load outreach message for subject
    const msgSnap = await db.collection("outreach_messages").doc(message_id).get();
    if (!msgSnap.exists) throw new HttpsError("not-found", "Message not found.");
    const msg = msgSnap.data();

    // Load lead for recipient email
    const leadSnap = await db.collection("leads").doc(lead_id).get();
    if (!leadSnap.exists) throw new HttpsError("not-found", "Lead not found.");
    const lead = leadSnap.data();
    const toEmail = lead.contact_email || lead.email;
    if (!toEmail) throw new HttpsError("failed-precondition", "Lead has no email address.");

    // Find latest inbound reply for threading headers
    const repliesSnap = await db.collection("inbound_replies")
      .where("lead_id", "==", lead_id)
      .get();

    const headers = {};
    const inboundReplies = repliesSnap.docs
      .map((d) => d.data())
      .filter((d) => d.direction !== "outbound" && d.rfc_message_id)
      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));

    if (inboundReplies.length > 0) {
      headers["In-Reply-To"] = inboundReplies[0].rfc_message_id;
      headers["References"] = inboundReplies[0].rfc_message_id;
    }

    // Send via Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new HttpsError("failed-precondition", "RESEND_API_KEY not configured.");
    const resend = new Resend(apiKey);

    const replyToAddress = `reply+${lead_id}@${REPLY_DOMAIN}`;
    const subject = `Re: ${msg.subject || "Asterley Bros"}`;

    const { data: resendData, error } = await resend.emails.send({
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: toEmail,
      replyTo: replyToAddress,
      subject,
      text: content.trim(),
      html: buildHtmlEmail(content.trim()),
      headers,
    });

    if (error) throw new HttpsError("internal", error.message);

    // Store in inbound_replies so it shows in the thread
    const replyId = crypto.randomUUID();
    await db.collection("inbound_replies").doc(replyId).set({
      id: replyId,
      lead_id,
      message_id,
      from_email: SENDER_EMAIL,
      from_name: "Rob",
      subject,
      body: content.trim(),
      source: "outbound_reply",
      direction: "outbound",
      matched: true,
      resend_email_id: resendData?.id ?? null,
      created_at: new Date().toISOString(),
    });

    // Update reply count on outreach message
    await db.collection("outreach_messages").doc(message_id).update({
      reply_count: FieldValue.increment(1),
    });

    return { reply_id: replyId, status: "sent" };
  });

// ---- User Deletion ----

/**
 * Fully delete a user: Auth + Firestore.
 */
export const deleteUser = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    // Check caller is admin
    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const { uid } = data;
    if (!uid) throw new HttpsError("invalid-argument", "uid required.");

    // Don't let admin delete themselves
    if (uid === context.auth.uid) {
      throw new HttpsError("failed-precondition", "Cannot delete yourself.");
    }

    try {
      // Delete from Firebase Auth
      await getAuth().deleteUser(uid);
    } catch (err) {
      console.error("Auth delete failed:", err.message);
      // Continue to delete Firestore doc even if Auth delete fails
    }

    // Unassign any leads assigned to this user
    const assignedLeadsSnap = await db.collection("leads")
      .where("assigned_to", "==", uid).get();
    if (!assignedLeadsSnap.empty) {
      const batch = db.batch();
      assignedLeadsSnap.docs.forEach((d) => {
        batch.update(d.ref, {
          assigned_to: null,
          assigned_to_name: null,
          assigned_at: null,
          assigned_by: null,
        });
      });
      await batch.commit();

      // Also unassign their messages and replies
      for (const leadDoc of assignedLeadsSnap.docs) {
        const msgsSnap = await db.collection("outreach_messages")
          .where("lead_id", "==", leadDoc.id).get();
        if (!msgsSnap.empty) {
          const b = db.batch();
          msgsSnap.docs.forEach((d) => b.update(d.ref, { assigned_to: null }));
          await b.commit();
        }
        const repliesSnap = await db.collection("inbound_replies")
          .where("lead_id", "==", leadDoc.id).get();
        if (!repliesSnap.empty) {
          const b = db.batch();
          repliesSnap.docs.forEach((d) => b.update(d.ref, { assigned_to: null }));
          await b.commit();
        }
      }
    }

    // Delete Firestore user doc
    await db.collection("users").doc(uid).delete();

    return { status: "deleted", uid };
  });

// ---- Lead Assignment ----

/**
 * Assign leads to a team member. Admin-only.
 * Input: { lead_ids: string[], assigned_to: string }
 */
export const assignLeads = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const { lead_ids, assigned_to } = data;
    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      throw new HttpsError("invalid-argument", "lead_ids required.");
    }
    if (!assigned_to) {
      throw new HttpsError("invalid-argument", "assigned_to required.");
    }

    // Look up target user
    const targetSnap = await db.collection("users").doc(assigned_to).get();
    if (!targetSnap.exists) {
      throw new HttpsError("not-found", "Target user not found.");
    }
    const targetData = targetSnap.data();
    const assignedToName = targetData.display_name || targetData.email;
    const now = new Date().toISOString();

    // Batch update leads
    const BATCH_LIMIT = 500;
    for (let i = 0; i < lead_ids.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      const chunk = lead_ids.slice(i, i + BATCH_LIMIT);

      for (const leadId of chunk) {
        batch.update(db.collection("leads").doc(leadId), {
          assigned_to,
          assigned_to_name: assignedToName,
          assigned_at: now,
          assigned_by: context.auth.uid,
        });
      }
      await batch.commit();
    }

    // Update outreach_messages for these leads
    for (const leadId of lead_ids) {
      const msgsSnap = await db.collection("outreach_messages")
        .where("lead_id", "==", leadId).get();
      if (!msgsSnap.empty) {
        const batch = db.batch();
        msgsSnap.docs.forEach((d) => batch.update(d.ref, { assigned_to }));
        await batch.commit();
      }

      // Update inbound_replies for these leads
      const repliesSnap = await db.collection("inbound_replies")
        .where("lead_id", "==", leadId).get();
      if (!repliesSnap.empty) {
        const batch = db.batch();
        repliesSnap.docs.forEach((d) => batch.update(d.ref, { assigned_to }));
        await batch.commit();
      }
    }

    // Audit log
    await db.collection("activity_log").add({
      action: "assign_leads",
      lead_ids,
      assigned_to,
      assigned_to_name: assignedToName,
      performed_by: context.auth.uid,
      created_at: now,
    });

    return { status: "ok", assigned: lead_ids.length, assigned_to, assigned_to_name: assignedToName };
  });

/**
 * Remove assignment from leads (return to admin pool). Admin-only.
 * Input: { lead_ids: string[] }
 */
export const unassignLeads = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const { lead_ids } = data;
    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      throw new HttpsError("invalid-argument", "lead_ids required.");
    }

    const now = new Date().toISOString();
    const BATCH_LIMIT = 500;

    for (let i = 0; i < lead_ids.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      const chunk = lead_ids.slice(i, i + BATCH_LIMIT);
      for (const leadId of chunk) {
        batch.update(db.collection("leads").doc(leadId), {
          assigned_to: null,
          assigned_to_name: null,
          assigned_at: null,
          assigned_by: null,
        });
      }
      await batch.commit();
    }

    // Update related messages and replies
    for (const leadId of lead_ids) {
      const msgsSnap = await db.collection("outreach_messages")
        .where("lead_id", "==", leadId).get();
      if (!msgsSnap.empty) {
        const batch = db.batch();
        msgsSnap.docs.forEach((d) => batch.update(d.ref, { assigned_to: null }));
        await batch.commit();
      }

      const repliesSnap = await db.collection("inbound_replies")
        .where("lead_id", "==", leadId).get();
      if (!repliesSnap.empty) {
        const batch = db.batch();
        repliesSnap.docs.forEach((d) => batch.update(d.ref, { assigned_to: null }));
        await batch.commit();
      }
    }

    await db.collection("activity_log").add({
      action: "unassign_leads",
      lead_ids,
      performed_by: context.auth.uid,
      created_at: now,
    });

    return { status: "ok", unassigned: lead_ids.length };
  });

// ---- Inbound Email Webhook (Resend) ----

/**
 * Strip quoted reply text from an email body.
 * Returns only the new content the person actually wrote.
 */
function stripQuotedReply(text) {
  if (!text) return "";
  const lines = text.split("\n");
  const cutPatterns = [
    /^-{2,}\s*Original Message\s*-{2,}/, // Outlook: "--- Original Message ---"
    /^_{2,}/,                             // Outlook underscores
    /^From:\s+/,                          // Outlook/generic: "From: Rob..."
    /^Sent from my /,                     // Mobile: "Sent from my iPhone"
    /^Get Outlook for /,                  // "Get Outlook for iOS"
  ];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (cutPatterns.some((p) => p.test(trimmed))) {
      return lines.slice(0, i).join("\n").trim();
    }
    // Gmail "On ... wrote:" — may span multiple lines, so check if line ends with "wrote:"
    if (/wrote:\s*$/.test(trimmed) && /^On\s/.test(trimmed)) {
      return lines.slice(0, i).join("\n").trim();
    }
    // Gmail multi-line: "On Mon, Apr 6, 2026 at 5:58 PM Name <email>\nwrote:"
    if (trimmed === "wrote:" && i > 0 && /^On\s/.test(lines[i - 1].trim())) {
      return lines.slice(0, i - 1).join("\n").trim();
    }
    // Lines starting with ">" are quoted
    if (trimmed.startsWith(">") && i > 0) {
      // Walk back over "On ... wrote:" lines
      let cutLine = i;
      if (/wrote:\s*$/.test(lines[i - 1].trim())) {
        cutLine = i - 1;
        if (cutLine > 0 && /^On\s/.test(lines[cutLine - 1].trim())) {
          cutLine = cutLine - 1;
        }
      }
      return lines.slice(0, cutLine).join("\n").trim();
    }
  }
  return text.trim();
}

/**
 * Extract lead_id from a plus-addressed reply-to address.
 * e.g. "reply+abc123@replies.asterleybros.com" → "abc123"
 */
function extractLeadIdFromTo(toAddresses) {
  for (const addr of toAddresses) {
    const email = typeof addr === "string" ? addr : addr?.email || addr?.address || "";
    const match = email.match(/^reply\+([^@]+)@/i);
    if (match) return match[1];
  }
  return null;
}

export const processInboundEmail = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB", secrets: ["RESEND_API_KEY", "GEMINI_API_KEY"] })
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    try {
      // Resend sends inbound emails as JSON
      const payload = req.body;
      const eventData = payload.data || payload;

      const resendEmailId = eventData.email_id || eventData.id || null;

      // Idempotency check
      if (resendEmailId) {
        const existing = await db.collection("webhook_events").doc(resendEmailId).get();
        if (existing.exists) {
          console.log("Duplicate webhook skipped:", resendEmailId);
          res.status(200).json({ status: "skipped", reason: "duplicate" });
          return;
        }
      }

      // Fetch full email content via Resend Receiving API
      // The webhook only sends metadata; the body is in the received email object
      let fullEmail = {};
      if (process.env.RESEND_API_KEY && resendEmailId) {
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 2000;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            if (attempt > 1) {
              console.log(`Receiving API retry ${attempt}/${MAX_RETRIES}`);
              await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            }
            const res = await fetch(`https://api.resend.com/emails/receiving/${resendEmailId}`, {
              headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
            });
            if (!res.ok) {
              console.warn(`Receiving API returned ${res.status}:`, (await res.text()).substring(0, 300));
              if (attempt < MAX_RETRIES) continue;
              break;
            }
            const receivedEmail = await res.json();
            if (receivedEmail.text || receivedEmail.html) {
              fullEmail = receivedEmail;
              console.log("Fetched email body via Receiving API:", {
                textLen: (receivedEmail.text || "").length,
                htmlLen: (receivedEmail.html || "").length,
              });
              break;
            }
            if (attempt < MAX_RETRIES) {
              console.warn(`Receiving API returned empty body on attempt ${attempt}, retrying...`);
              continue;
            }
          } catch (fetchErr) {
            console.warn(`Receiving API error (attempt ${attempt}):`, fetchErr.message);
            if (attempt < MAX_RETRIES) continue;
          }
        }
      }

      const fromEmail = (eventData.from?.email || eventData.from || "").toLowerCase().trim();
      const fromName = eventData.from?.name || fullEmail.from?.name || null;
      const subject = eventData.subject || "";
      const textBody = fullEmail.text || eventData.text || "";
      const htmlBody = fullEmail.html || eventData.html || "";
      const toAddresses = eventData.to || [];

      // Extract lead_id from the plus-addressed reply-to
      const leadIdFromAddress = extractLeadIdFromTo(
        Array.isArray(toAddresses) ? toAddresses : [toAddresses]
      );

      // Primary matching: lead_id from plus-address
      let matchedLead = null;
      let matchedMessage = null;
      let matchedBy = null;

      if (leadIdFromAddress) {
        const leadSnap = await db.collection("leads").doc(leadIdFromAddress).get();
        if (leadSnap.exists) {
          matchedLead = { id: leadSnap.id, ...leadSnap.data() };
          matchedBy = "plus_address";
        }
      }

      // Fallback: match by sender email
      if (!matchedLead) {
        const leadsByEmail = await db.collection("leads")
          .where("email", "==", fromEmail).limit(1).get();
        if (!leadsByEmail.empty) {
          matchedLead = { id: leadsByEmail.docs[0].id, ...leadsByEmail.docs[0].data() };
          matchedBy = "email_lookup";
        } else {
          const leadsByContact = await db.collection("leads")
            .where("contact_email", "==", fromEmail).limit(1).get();
          if (!leadsByContact.empty) {
            matchedLead = { id: leadsByContact.docs[0].id, ...leadsByContact.docs[0].data() };
            matchedBy = "email_lookup";
          }
        }
      }

      // Find the most recent sent message for this lead
      if (matchedLead) {
        const msgSnap = await db.collection("outreach_messages")
          .where("lead_id", "==", matchedLead.id)
          .where("status", "==", "sent")
          .limit(1)
          .get();
        if (!msgSnap.empty) {
          matchedMessage = { id: msgSnap.docs[0].id, ...msgSnap.docs[0].data() };
        }
      }

      // Detect auto-replies
      const headers = eventData.headers || {};
      const autoSubmitted = headers["auto-submitted"] || headers["Auto-Submitted"] || "";
      const isAutoReply = autoSubmitted !== "" && autoSubmitted !== "no";

      // Create inbound_replies doc
      const replyId = crypto.randomUUID();
      const rawBody = textBody || htmlBody;
      const parsedBody = stripQuotedReply(textBody) || rawBody;
      await db.collection("inbound_replies").doc(replyId).set({
        id: replyId,
        lead_id: matchedLead?.id || null,
        message_id: matchedMessage?.id || null,
        from_email: fromEmail,
        from_name: fromName,
        subject,
        body: parsedBody,
        body_raw: rawBody,
        body_html: htmlBody,
        source: "resend",
        direction: "inbound",
        matched: !!matchedLead,
        matched_by: matchedBy,
        is_auto_reply: isAutoReply,
        rfc_message_id: fullEmail.message_id || eventData.message_id || null,
        resend_email_id: resendEmailId,
        has_attachments: (eventData.attachments || []).length > 0,
        attachment_count: (eventData.attachments || []).length,
        created_at: new Date().toISOString(),
      });

      // Sentiment analysis via Gemini (skip auto-replies)
      let sentimentResult = null;
      if (!isAutoReply && parsedBody && parsedBody.trim().length >= 5) {
        try {
          sentimentResult = await analyzeSentiment(parsedBody);
          if (sentimentResult?.sentiment) {
            await db.collection("inbound_replies").doc(replyId).update({
              sentiment: sentimentResult.sentiment,
              sentiment_reason: sentimentResult.reason || null,
              sentiment_analyzed_at: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn("Sentiment analysis failed (non-blocking):", err.message);
        }
      }

      // Update lead if matched (skip stage update for auto-replies)
      if (matchedLead && !isAutoReply) {
        const leadUpdate = {
          stage: "responded",
          human_takeover: true,
          human_takeover_at: new Date().toISOString(),
          reply_count: FieldValue.increment(1),
          outcome: matchedLead.outcome || "ongoing",
        };

        // Refine outcome based on sentiment
        if (sentimentResult?.sentiment === "negative" && matchedLead.outcome !== "converted") {
          leadUpdate.outcome = "not_interested";
        }

        await db.collection("leads").doc(matchedLead.id).update(leadUpdate);

        // Delete any pending planned follow-up card for this lead
        const plannedSnap = await db.collection("outreach_messages")
          .where("lead_id", "==", matchedLead.id)
          .where("status", "==", "planned")
          .get();
        if (!plannedSnap.empty) {
          const batch = db.batch();
          plannedSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }

      // Update message if matched
      if (matchedMessage) {
        await db.collection("outreach_messages").doc(matchedMessage.id).update({
          has_reply: true,
          reply_count: FieldValue.increment(1),
        });
      }

      // Log idempotency record
      if (resendEmailId) {
        await db.collection("webhook_events").doc(resendEmailId).set({
          event_type: "inbound",
          resend_email_id: resendEmailId,
          processed_at: new Date().toISOString(),
          status: "processed",
          reply_id: replyId,
        });
      }

      // Activity log
      await db.collection("activity_log").add({
        type: "inbound_reply",
        lead_id: matchedLead?.id || null,
        reply_id: replyId,
        matched: !!matchedLead,
        matched_by: matchedBy,
        from_email: fromEmail,
        is_auto_reply: isAutoReply,
        created_at: new Date().toISOString(),
      });

      console.log("Inbound reply processed", {
        replyId,
        matched: !!matchedLead,
        matchedBy,
        fromEmail,
        isAutoReply,
      });
      res.status(200).json({ status: "ok", matched: !!matchedLead, reply_id: replyId });
    } catch (err) {
      console.error("processInboundEmail error:", err.message);
      // Always return 200 to prevent retries on processing errors
      res.status(200).json({ status: "error", error: err.message });
    }
  });

// ---- Log Reply Manually ----

export const logReply = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const { lead_id, message_id, notes } = data;
    if (!lead_id) throw new HttpsError("invalid-argument", "lead_id required.");

    const leadSnap = await db.collection("leads").doc(lead_id).get();
    if (!leadSnap.exists) throw new HttpsError("not-found", "Lead not found.");
    const lead = leadSnap.data();

    const replyId = crypto.randomUUID();
    await db.collection("inbound_replies").doc(replyId).set({
      id: replyId,
      lead_id,
      message_id: message_id || null,
      from_email: lead.email || lead.contact_email || "unknown",
      from_name: lead.contact_name || lead.business_name || null,
      subject: null,
      body: notes || "Reply logged manually",
      source: "manual",
      matched: true,
      created_at: new Date().toISOString(),
      forwarded_by: null,
      logged_by: context.auth.uid,
    });

    await db.collection("leads").doc(lead_id).update({
      stage: "responded",
      human_takeover: true,
      human_takeover_at: new Date().toISOString(),
      reply_count: FieldValue.increment(1),
      outcome: lead.outcome || "ongoing",
    });

    // Delete any pending planned follow-up card for this lead
    const plannedSnap = await db.collection("outreach_messages")
      .where("lead_id", "==", lead_id)
      .where("status", "==", "planned")
      .get();
    if (!plannedSnap.empty) {
      const batch = db.batch();
      plannedSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    if (message_id) {
      const msgSnap = await db.collection("outreach_messages").doc(message_id).get();
      if (msgSnap.exists) {
        await db.collection("outreach_messages").doc(message_id).update({
          has_reply: true,
          reply_count: FieldValue.increment(1),
        });
      }
    }

    await db.collection("activity_log").add({
      type: "manual_reply_logged",
      lead_id,
      reply_id: replyId,
      logged_by: context.auth.uid,
      created_at: new Date().toISOString(),
    });

    return { reply_id: replyId, status: "ok" };
  });

// ---- Update Lead Outcome ----

export const updateLeadOutcome = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const { lead_id, outcome } = data;
    if (!lead_id || !outcome) throw new HttpsError("invalid-argument", "lead_id and outcome required.");

    const validOutcomes = ["ongoing", "converted", "lost", "not_interested", "snoozed"];
    if (!validOutcomes.includes(outcome)) {
      throw new HttpsError("invalid-argument", `Invalid outcome. Must be one of: ${validOutcomes.join(", ")}`);
    }

    const leadSnap = await db.collection("leads").doc(lead_id).get();
    if (!leadSnap.exists) throw new HttpsError("not-found", "Lead not found.");

    const updates = {
      outcome,
      outcome_updated_at: new Date().toISOString(),
    };

    if (outcome === "converted") updates.stage = "converted";
    else if (outcome === "lost" || outcome === "not_interested") updates.stage = "declined";

    await db.collection("leads").doc(lead_id).update(updates);

    await db.collection("activity_log").add({
      type: "outcome_updated",
      lead_id,
      outcome,
      updated_by: context.auth.uid,
      created_at: new Date().toISOString(),
    });

    return { status: "ok", outcome };
  });

// ---- Assign Unmatched Reply to Lead ----

export const assignReplyToLead = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const { reply_id, lead_id } = data;
    if (!reply_id || !lead_id) throw new HttpsError("invalid-argument", "reply_id and lead_id required.");

    const replySnap = await db.collection("inbound_replies").doc(reply_id).get();
    if (!replySnap.exists) throw new HttpsError("not-found", "Reply not found.");

    const leadSnap = await db.collection("leads").doc(lead_id).get();
    if (!leadSnap.exists) throw new HttpsError("not-found", "Lead not found.");
    const lead = leadSnap.data();

    // Find most recent sent message for the lead
    const msgSnap = await db.collection("outreach_messages")
      .where("lead_id", "==", lead_id)
      .where("status", "==", "sent")
      .limit(1)
      .get();
    const matchedMessageId = msgSnap.empty ? null : msgSnap.docs[0].id;

    await db.collection("inbound_replies").doc(reply_id).update({
      lead_id,
      message_id: matchedMessageId,
      matched: true,
    });

    await db.collection("leads").doc(lead_id).update({
      stage: "responded",
      human_takeover: true,
      human_takeover_at: new Date().toISOString(),
      reply_count: FieldValue.increment(1),
      outcome: lead.outcome || "ongoing",
    });

    // Delete any pending planned follow-up card for this lead
    const plannedSnap = await db.collection("outreach_messages")
      .where("lead_id", "==", lead_id)
      .where("status", "==", "planned")
      .get();
    if (!plannedSnap.empty) {
      const batch = db.batch();
      plannedSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    if (matchedMessageId) {
      await db.collection("outreach_messages").doc(matchedMessageId).update({
        has_reply: true,
        reply_count: FieldValue.increment(1),
      });
    }

    return { status: "ok" };
  });

// ---- Generate Follow-Up Drafts ----

/**
 * Core follow-up generation logic, shared by the callable and the scheduled trigger.
 * Returns { generated, skipped, failed, total }.
 *
 * New approach: prioritize filling existing "planned" cards with content.
 * Fallback: create planned cards for legacy leads that don't have them yet.
 */
async function runFollowUpGeneration() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured.");
  }

  const anthropic = new Anthropic({ apiKey });

  // Fetch all data upfront
  const msgsSnap = await db.collection("outreach_messages").get();
  const allMessages = msgsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const leadsSnap = await db.collection("leads").get();
  const allLeads = leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const repliesSnap = await db.collection("inbound_replies")
    .where("matched", "==", true)
    .get();
  const leadsWithReplies = new Set(
    repliesSnap.docs.map((d) => d.data().lead_id).filter(Boolean)
  );

  const now = new Date();
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let total = 0;

  // ---- STEP 1: Fill existing planned cards ----
  const plannedDocs = allMessages.filter((m) => m.status === "planned");

  for (const plannedDoc of plannedDocs) {
    total++;
    try {
      const lead = allLeads.find((l) => l.id === plannedDoc.lead_id);
      if (!lead) {
        console.log(`SKIP [${plannedDoc.business_name}]: lead not found`);
        skipped++;
        continue;
      }

      // Check if this planned card is ready to fill (scheduled_send_date <= tomorrow)
      if (!plannedDoc.scheduled_send_date || plannedDoc.scheduled_send_date > tomorrowStr) {
        console.log(`SKIP [${plannedDoc.business_name}]: planned card not due yet (${plannedDoc.scheduled_send_date})`);
        skipped++;
        continue;
      }

      // Run skip checks
      const skipReason = shouldSkipLead(lead, leadsWithReplies.has(lead.id));
      if (skipReason) {
        console.log(`SKIP [${plannedDoc.business_name}]: ${skipReason}`);
        skipped++;
        continue;
      }

      // Lock for concurrency: use transaction to atomically check status="planned" then set to "generating" (Bug #10)
      const locked = await db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(db.collection("outreach_messages").doc(plannedDoc.id));
        if (!docSnap.exists || docSnap.data().status !== "planned") {
          return false; // Already being processed or status changed
        }
        transaction.update(db.collection("outreach_messages").doc(plannedDoc.id), { status: "generating" });
        return true;
      }).catch(() => false);

      if (!locked) {
        console.log(`SKIP [${plannedDoc.business_name}]: being processed by another instance`);
        skipped++;
        continue;
      }

      // Find previous subject and message ID for email threading
      const leadMessages = allMessages.filter((m) => m.lead_id === lead.id);
      const sentMessages = leadMessages.filter((m) => m.status === "sent").sort((a, b) => (a.step_number ?? 1) - (b.step_number ?? 1));
      const initialMessage = sentMessages[0]; // First sent message (step 1)
      const lastSent = sentMessages[sentMessages.length - 1]; // Last sent message
      const previousSubject = initialMessage?.subject || lastSent?.subject || "";
      // Bug #9: Build References chain from all prior sent messages
      const allPriorMessageIds = sentMessages.map((m) => m.email_message_id).filter(Boolean);
      const parentEmailMessageId = initialMessage?.email_message_id || null;

      // Generate the follow-up content
      const enrichment = lead.enrichment || {};
      const venueCat = enrichment.venue_category || lead.category || "cocktail_bar";
      const toneTier = enrichment.tone_tier || "bartender_casual";
      const prompt = buildPrompt(lead, enrichment, plannedDoc.step_number, previousSubject);

      const feedbackBlock = await getEditFeedback(venueCat, toneTier);
      const promptRules = await getPromptRules();
      const systemPrompt = EMAIL_SYSTEM_PROMPT
        + (promptRules ? `\n\nPROMPT RULES (apply to every email):\n${promptRules}` : "")
        + (feedbackBlock || "");

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      });

      let content = response.content[0].text || "";
      let subject = null;

      if (content.includes("Subject:")) {
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim().startsWith("Subject:")) {
            subject = lines[i].trim().replace("Subject:", "").trim();
            content = lines.slice(i + 1).join("\n").trim();
            break;
          }
        }
      }

      // Update the planned doc: status -> draft, fill content/subject
      await db.collection("outreach_messages").doc(plannedDoc.id).update({
        status: "draft",
        content,
        subject,
        original_content: content,
        original_subject: subject,
      });

      // Update lead stage if needed (follow_up_1 for step 2, follow_up_2 for step 3+)
      const newStage = plannedDoc.step_number === 2 ? "follow_up_1"
        : plannedDoc.step_number >= 3 ? "follow_up_2"
        : null;
      if (newStage && newStage !== lead.stage) {
        await db.collection("leads").doc(lead.id).update({ stage: newStage });
      }

      console.log(`GENERATE [${lead.business_name}]: step ${plannedDoc.step_number} (${plannedDoc.follow_up_label}), send on ${plannedDoc.scheduled_send_date}`);
      generated++;
    } catch (err) {
      console.error("Follow-up draft failed for", plannedDoc.business_name, err.message);
      // Unlock by setting status back to "planned" for retry
      await db.collection("outreach_messages").doc(plannedDoc.id).update({
        status: "planned",
      }).catch(() => null);
      failed++;
    }
  }

  // ---- STEP 2: Backward-compat fallback for legacy leads ----
  const eligibleStages = ["sent", "follow_up_1", "follow_up_2"];
  const legacyLeads = allLeads.filter((l) => {
    // Only process leads that don't already have a planned card
    const hasPlannedCard = plannedDocs.some((p) => p.lead_id === l.id);
    return !hasPlannedCard && eligibleStages.includes(l.stage);
  });

  for (const lead of legacyLeads) {
    try {
      const skipReason = shouldSkipLead(lead, leadsWithReplies.has(lead.id));
      if (skipReason) {
        console.log(`SKIP [${lead.business_name}]: ${skipReason}`);
        skipped++;
        continue;
      }

      const leadMessages = allMessages.filter((m) => m.lead_id === lead.id);
      const result = determineFollowUpAction(leadMessages, now);

      if (result.action === "complete") {
        console.log(`COMPLETE [${lead.business_name}]: marking no_response`);
        await db.collection("leads").doc(lead.id).update({ stage: "no_response" });
        skipped++;
        continue;
      }

      if (result.action === "skip") {
        console.log(`SKIP [${lead.business_name}]: ${result.reason}`);
        skipped++;
        continue;
      }

      const { nextStepNumber, followUpLabel, scheduledSendDate } = result;

      // Find previous subject and message ID for email threading
      const sentMessages2 = leadMessages.filter((m) => m.status === "sent").sort((a, b) => (a.step_number ?? 1) - (b.step_number ?? 1));
      const initialMessage = sentMessages2[0]; // First sent message (step 1)
      const lastSent = sentMessages2[sentMessages2.length - 1]; // Last sent message
      const previousSubject = initialMessage?.subject || lastSent?.subject || "";
      // Bug #9: Build References chain from all prior sent messages
      const allPriorMessageIds2 = sentMessages2.map((m) => m.email_message_id).filter(Boolean);
      const parentEmailMessageId = initialMessage?.email_message_id || null;

      // Generate the follow-up draft
      const enrichment = lead.enrichment || {};
      const venueCat = enrichment.venue_category || lead.category || "cocktail_bar";
      const toneTier = enrichment.tone_tier || "bartender_casual";
      const prompt = buildPrompt(lead, enrichment, nextStepNumber, previousSubject);

      const feedbackBlock = await getEditFeedback(venueCat, toneTier);
      const promptRules = await getPromptRules();
      const systemPrompt = EMAIL_SYSTEM_PROMPT
        + (promptRules ? `\n\nPROMPT RULES (apply to every email):\n${promptRules}` : "")
        + (feedbackBlock || "");

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      });

      let content = response.content[0].text || "";
      let subject = null;

      if (content.includes("Subject:")) {
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim().startsWith("Subject:")) {
            subject = lines[i].trim().replace("Subject:", "").trim();
            content = lines.slice(i + 1).join("\n").trim();
            break;
          }
        }
      }

      const contact = enrichment.contact || {};
      const msgId = crypto.randomUUID();
      await db.collection("outreach_messages").doc(msgId).set({
        id: msgId,
        lead_id: lead.id,
        business_name: lead.business_name,
        venue_category: enrichment.venue_category || null,
        channel: "email",
        subject,
        content,
        status: "draft",
        step_number: nextStepNumber,
        follow_up_label: followUpLabel,
        scheduled_send_date: scheduledSendDate,
        created_at: new Date().toISOString(),
        tone_tier: enrichment.tone_tier || null,
        lead_products: enrichment.lead_products || [],
        contact_name: lead.contact_name || contact.name || null,
        context_notes: enrichment.context_notes || null,
        menu_fit: enrichment.menu_fit || null,
        recipient_email: lead.email || lead.contact_email || null,
        website: lead.website || null,
        workspace_id: lead.workspace_id || "",
        assigned_to: lead.assigned_to || null,
        original_content: content,
        original_subject: subject,
        was_edited: false,
        parent_email_message_id: parentEmailMessageId,
      });

      // Update lead stage
      if (result.newStage && result.newStage !== lead.stage) {
        await db.collection("leads").doc(lead.id).update({ stage: result.newStage });
      }

      console.log(`GENERATE [${lead.business_name}]: step ${nextStepNumber} (${followUpLabel}), send on ${scheduledSendDate}`);
      total++;
      generated++;
    } catch (err) {
      console.error("Follow-up draft failed for", lead.business_name, err.message);
      total++;
      failed++;
    }
  }

  // ---- STEP 3: Channel escalation — Instagram DM if email unopened ----
  for (const lead of allLeads) {
    try {
      const skipReason = shouldSkipLead(lead, leadsWithReplies.has(lead.id));
      if (skipReason) {
        continue; // Silent skip for escalation checks
      }

      if (!lead.instagram_handle) {
        continue; // No Instagram handle, can't escalate
      }

      const leadMessages = allMessages.filter((m) => m.lead_id === lead.id);

      if (!shouldGenerateEscalationDm(leadMessages, now)) {
        continue;
      }

      // Check if escalation DM already exists (planned, draft, approved, or sent)
      const existingDm = leadMessages.find(
        (m) => m.is_channel_escalation === true &&
          (m.status === "planned" || m.status === "draft" || m.status === "approved" || m.status === "sent")
      );
      if (existingDm) {
        continue; // Already handled
      }

      // Generate Instagram DM draft using Claude
      const enrichment = lead.enrichment || {};
      let dmContent = "";
      try {
        const dmPrompt = `${INSTAGRAM_ESCALATION_PROMPT}

RECIPIENT: ${lead.business_name}
INSTAGRAM: ${lead.instagram_handle}
CONTEXT: ${enrichment.context_notes || "No additional context"}`;

        const dmResponse = await claudeClient.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content: dmPrompt,
            },
          ],
        });

        dmContent = dmResponse.content[0]?.type === "text" ? dmResponse.content[0].text : "";
      } catch (err) {
        console.warn(`Failed to generate DM content for ${lead.business_name}:`, err.message);
        dmContent = "Hey! Saw your venue and thought you'd love Asterley Bros. Mind if I reach out?";
      }

      // Create draft for approval
      const dmId = crypto.randomUUID();
      await db.collection("outreach_messages").doc(dmId).set({
        id: dmId,
        lead_id: lead.id,
        business_name: lead.business_name,
        venue_category: enrichment.venue_category || null,
        channel: "instagram_dm",
        subject: null,
        content: dmContent,
        status: "draft",
        step_number: 2,
        follow_up_label: null,
        is_channel_escalation: true,
        scheduled_send_date: tomorrowStr,
        created_at: new Date().toISOString(),
        tone_tier: enrichment.tone_tier || null,
        lead_products: enrichment.lead_products || [],
        contact_name: lead.contact_name || null,
        context_notes: enrichment.context_notes || null,
        menu_fit: enrichment.menu_fit || null,
        recipient_email: lead.instagram_handle || null,
        website: lead.website || null,
        workspace_id: lead.workspace_id || "",
        assigned_to: lead.assigned_to || null,
        was_edited: false,
      });

      console.log(`ESCALATE [${lead.business_name}]: Instagram DM draft created for approval`);
      generated++;
    } catch (err) {
      console.error("Escalation DM creation failed for", lead.business_name, err.message);
      failed++;
    }
  }

  return { generated, skipped, failed, total };
}

/**
 * Manual trigger — callable from frontend.
 */
export const generateFollowups = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB", secrets: ["ANTHROPIC_API_KEY"] })
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }
    return runFollowUpGeneration();
  });

/**
 * Scheduled trigger — runs Mon-Fri at 8am London time.
 * Skips weekends, bank holidays, and Dec 24 - Jan 3.
 * Generates follow-up drafts so they're ready for review
 * before the optimal send window (Tue-Thu 9-11am).
 */
export const scheduledFollowups = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB", secrets: ["ANTHROPIC_API_KEY"] })
  .pubsub.schedule("0 8 * * 1-5")
  .timeZone("Europe/London")
  .onRun(async () => {
    // Skip blackout days (bank holidays, Dec 24 - Jan 3)
    const now = new Date();
    const london = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
    if (isBlackoutDay(london)) {
      console.log("Scheduled follow-ups skipped: blackout day");
      return null;
    }

    const result = await runFollowUpGeneration();
    console.log("Scheduled follow-up generation:", JSON.stringify(result));
    return null;
  });

/**
 * Scheduled trigger — runs Tue-Thu at 9am London time.
 * Automatically sends approved follow-up emails (step 2+) whose scheduled_send_date is due.
 * Respects blackout days, the daily cap, and only processes follow-up messages.
 */
export const scheduledSendFollowups = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB", secrets: ["RESEND_API_KEY"] })
  .pubsub.schedule("0 9 * * 2-4")
  .timeZone("Europe/London")
  .onRun(async () => {
    const now = new Date();
    const london = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));

    // Skip blackout days (bank holidays, Dec 24 - Jan 3)
    if (isBlackoutDay(london)) {
      console.log("Scheduled follow-up send skipped: blackout day");
      return null;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured");
      return null;
    }

    const todayStr = london.toISOString().split("T")[0];

    // Daily cap check (shared with manual sends)
    // Compute London midnight in UTC from london date components
    const todayMidnight = new Date(Date.UTC(london.getFullYear(), london.getMonth(), london.getDate()));
    const sentTodaySnap = await db.collection("outreach_messages")
      .where("status", "==", "sent")
      .where("sent_at", ">=", todayMidnight.toISOString())
      .get();

    if (sentTodaySnap.size >= DAILY_CAP) {
      console.log(`Scheduled follow-up send skipped: daily cap of ${DAILY_CAP} reached`);
      return null;
    }

    const remaining = DAILY_CAP - sentTodaySnap.size;

    // Find approved follow-up messages (step 2+) that are due to send today
    const approvedSnap = await db.collection("outreach_messages")
      .where("status", "==", "approved")
      .where("channel", "==", "email")
      .get();

    const dueMessages = approvedSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => (m.step_number ?? 1) > 1 && m.scheduled_send_date && m.scheduled_send_date <= todayStr)
      .slice(0, remaining);

    if (!dueMessages.length) {
      console.log("Scheduled follow-up send: no due messages");
      return null;
    }

    const resend = new Resend(apiKey);
    let sent = 0;
    let failed = 0;

    for (const msg of dueMessages) {
      // Skip non-email channels (e.g., instagram_dm) — manual send only
      if (msg.channel !== "email") {
        console.log(`SKIP [${msg.business_name}]: channel "${msg.channel}" is not auto-sent`);
        failed++;
        continue;
      }

      try {
        const leadSnap = await db.collection("leads").doc(msg.lead_id).get();
        if (!leadSnap.exists) { failed++; continue; }

        const lead = leadSnap.data();
        const toEmail = lead.contact_email || lead.email;
        if (!toEmail) {
          console.error("No email for lead", msg.lead_id, lead.business_name);
          failed++;
          continue;
        }

        const replyToAddress = `reply+${msg.lead_id}@${REPLY_DOMAIN}`;

        // Thread as a reply in the same conversation
        const sendHeaders = {};
        const repliesSnap = await db.collection("inbound_replies")
          .where("lead_id", "==", msg.lead_id)
          .get();
        const inboundReplies = repliesSnap.docs
          .map((d) => d.data())
          .filter((d) => d.direction !== "outbound" && d.rfc_message_id)
          .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));

        if (inboundReplies.length > 0) {
          sendHeaders["In-Reply-To"] = inboundReplies[0].rfc_message_id;
          sendHeaders["References"] = inboundReplies[0].rfc_message_id;
        } else {
          // Build References chain from all prior sent messages (Bug #9)
          const priorMessagesSnap = await db.collection("outreach_messages")
            .where("lead_id", "==", msg.lead_id)
            .where("status", "==", "sent")
            .get();
          const priorMessages = priorMessagesSnap.docs
            .map((d) => d.data())
            .filter((m) => m.email_message_id && (m.step_number ?? 1) < (msg.step_number ?? 1))
            .sort((a, b) => (a.step_number ?? 1) - (b.step_number ?? 1));

          if (priorMessages.length > 0) {
            const rfcChain = priorMessages
              .map((m) => m.email_message_id.includes("@") ? `<${m.email_message_id}>` : `<${m.email_message_id}@resend.dev>`)
              .join(" ");
            const lastMessageId = priorMessages[priorMessages.length - 1].email_message_id;
            const lastRfc = lastMessageId.includes("@") ? `<${lastMessageId}>` : `<${lastMessageId}@resend.dev>`;
            sendHeaders["In-Reply-To"] = lastRfc;
            sendHeaders["References"] = rfcChain;
          }
        }

        const { data: resendData, error } = await resend.emails.send({
          from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
          to: toEmail,
          replyTo: replyToAddress,
          subject: msg.subject || "Asterley Bros",
          text: msg.content,
          html: buildHtmlEmail(msg.content),
          ...(Object.keys(sendHeaders).length > 0 ? { headers: sendHeaders } : {}),
        });

        if (error) throw new Error(error.message);

        const sentAt = new Date().toISOString();
        await db.collection("outreach_messages").doc(msg.id).update({
          status: "sent",
          sent_at: sentAt,
          reply_to_address: replyToAddress,
          email_message_id: resendData?.id ?? null,
        });

        // Update lead stage based on which step was just sent
        const sentStepNumber = msg.step_number ?? 1;
        const newLeadStage = sentStepNumber === 1 ? "sent"
          : sentStepNumber === 2 ? "follow_up_1"
          : "follow_up_2";
        await db.collection("leads").doc(msg.lead_id).update({ stage: newLeadStage });

        // Create planned card for the next step
        const nextStep = sentStepNumber + 1;
        if (nextStep <= 5) {
          // Check if a card already exists for this step
          const existingNextStep = await db.collection("outreach_messages")
            .where("lead_id", "==", msg.lead_id)
            .where("step_number", "==", nextStep)
            .where("status", "in", ["planned", "draft", "approved", "sent"])
            .limit(1)
            .get();

          if (!existingNextStep.empty) {
            console.log(`Planned card for step ${nextStep} already exists for lead ${msg.lead_id}`);
          } else {
            const scheduledDate = new Date(sentAt);
            scheduledDate.setDate(scheduledDate.getDate() + FOLLOW_UP_GAP_DAYS[nextStep]);
            const scheduledSendDate = scheduledDate.toISOString().split("T")[0];
            const plannedId = crypto.randomUUID();
            await db.collection("outreach_messages").doc(plannedId).set({
              id: plannedId,
              lead_id: msg.lead_id,
              business_name: msg.business_name,
              venue_category: msg.venue_category || null,
              channel: "email",
              subject: null,
              content: "",
              status: "planned",
              step_number: nextStep,
              follow_up_label: FOLLOW_UP_LABELS[nextStep],
              scheduled_send_date: scheduledSendDate,
              created_at: new Date().toISOString(),
              tone_tier: msg.tone_tier || null,
              lead_products: msg.lead_products || [],
              contact_name: msg.contact_name || null,
              context_notes: msg.context_notes || null,
              menu_fit: msg.menu_fit || null,
              recipient_email: toEmail,
              website: msg.website || null,
              workspace_id: msg.workspace_id || "",
              assigned_to: msg.assigned_to || null,
              was_edited: false,
              parent_email_message_id: resendData?.id ?? null,
            });
          }
        }

        console.log(`Sent follow-up step ${msg.step_number} to ${lead.business_name} (${toEmail})`);
        sent++;
      } catch (err) {
        console.error("Failed to send follow-up for", msg.lead_id, err.message);
        failed++;
      }
    }

    console.log("Scheduled follow-up send complete:", JSON.stringify({ sent, failed, total: dueMessages.length }));
    return null;
  });

/**
 * One-time migration — callable from admin UI.
 * Creates planned cards for existing sent emails that don't have a next-step card yet.
 * Safe to run multiple times (idempotent via duplicate check).
 */
export const backfillPlannedCards = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!userSnap.exists || userSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    // Fetch all messages and replies upfront
    const msgsSnap = await db.collection("outreach_messages").get();
    const allMessages = msgsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const repliesSnap = await db.collection("inbound_replies")
      .where("matched", "==", true)
      .get();
    const leadsWithReplies = new Set(
      repliesSnap.docs.map((d) => d.data().lead_id).filter(Boolean)
    );

    const sentMessages = allMessages.filter(
      (m) => m.status === "sent" && m.sent_at && (m.step_number ?? 1) < 4
    );

    let created = 0;
    let skipped = 0;

    for (const msg of sentMessages) {
      const nextStep = (msg.step_number ?? 1) + 1;

      // Skip if lead has replied
      if (leadsWithReplies.has(msg.lead_id)) {
        skipped++;
        continue;
      }

      // Query Firestore for duplicate check (Bug #13) — don't rely on stale snapshot
      const existingSnap = await db.collection("outreach_messages")
        .where("lead_id", "==", msg.lead_id)
        .where("step_number", "==", nextStep)
        .where("status", "in", ["planned", "draft", "approved", "sent"])
        .limit(1)
        .get();
      if (!existingSnap.empty) {
        skipped++;
        continue;
      }

      // Anchor timing to step 1, not the current message (Bug #7)
      const leadMessages = allMessages.filter((m) => m.lead_id === msg.lead_id && m.status === "sent");
      const initialMessage = leadMessages.find((m) => m.step_number === 1);
      const referenceMessage = initialMessage || leadMessages[0];
      const sentDate = new Date(referenceMessage?.sent_at || msg.sent_at);
      const scheduledDate = new Date(sentDate);
      scheduledDate.setDate(scheduledDate.getDate() + FOLLOW_UP_GAP_DAYS[nextStep]);
      const scheduledSendDate = scheduledDate.toISOString().split("T")[0];

      const plannedId = crypto.randomUUID();
      await db.collection("outreach_messages").doc(plannedId).set({
        id: plannedId,
        lead_id: msg.lead_id,
        business_name: msg.business_name,
        venue_category: msg.venue_category || null,
        channel: "email",
        subject: null,
        content: "",
        status: "planned",
        step_number: nextStep,
        follow_up_label: FOLLOW_UP_LABELS[nextStep],
        scheduled_send_date: scheduledSendDate,
        created_at: new Date().toISOString(),
        tone_tier: msg.tone_tier || null,
        lead_products: msg.lead_products || [],
        contact_name: msg.contact_name || null,
        context_notes: msg.context_notes || null,
        menu_fit: msg.menu_fit || null,
        recipient_email: msg.recipient_email || null,
        website: msg.website || null,
        workspace_id: msg.workspace_id || "",
        assigned_to: msg.assigned_to || null,
        was_edited: false,
        parent_email_message_id: msg.email_message_id || null,
      });

      created++;
    }

    console.log("Backfill planned cards complete:", JSON.stringify({ created, skipped, total: sentMessages.length }));
    return { created, skipped, total: sentMessages.length };
  });

// ── processEmailEvents: Resend webhook for open/delivery/bounce tracking ──
export const processEmailEvents = functions
  .runWith({ timeoutSeconds: 15, memory: "128MB" })
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    try {
      const { type, data } = req.body;

      if (!type || !data?.email_id) {
        res.status(400).json({ error: "Invalid event" });
        return;
      }

      const emailId = data.email_id;

      // Find outreach message by Resend email ID
      const snap = await db
        .collection("outreach_messages")
        .where("email_message_id", "==", emailId)
        .limit(1)
        .get();

      if (snap.empty) {
        console.log("Email event for unknown message:", emailId, type);
        res.status(200).json({ status: "ignored", reason: "message not found" });
        return;
      }

      const docRef = snap.docs[0].ref;
      const now = new Date().toISOString();

      switch (type) {
        case "email.opened":
          await docRef.update({
            opened: true,
            open_count: FieldValue.increment(1),
            last_opened_at: now,
          });
          console.log("Email opened:", emailId);
          break;

        case "email.delivered":
          await docRef.update({
            delivered: true,
            delivered_at: now,
          });
          console.log("Email delivered:", emailId);
          break;

        case "email.bounced":
          await docRef.update({
            status: "bounced",
          });
          console.log("Email bounced:", emailId);
          break;

        case "email.clicked":
          console.log("Email link clicked:", emailId);
          break;

        default:
          console.log("Unhandled email event:", type, emailId);
      }

      res.status(200).json({ status: "ok" });
    } catch (err) {
      console.error("processEmailEvents error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
/**
 * Build HTML for weekly analytics summary email.
 */
function buildAnalyticsSummaryHtml(stats) {
  const {
    totalLeads,
    activeInSequence,
    responseRate,
    conversionRate,
    sentLast7Days,
    openedLast7Days,
    openRateLast7Days,
    repliedLast7Days,
    replyRateLast7Days,
    approvedWaiting,
    plannedToDraft,
    escalationDMsPending,
    stageBreakdown,
    dateRange,
  } = stats;

  const formatPercent = (num) => (isNaN(num) ? "0%" : `${Math.round(num)}%`);

  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #1f2937; margin: 0 0 5px 0; font-size: 24px; }
          .header p { color: #6b7280; margin: 0; font-size: 14px; }
          .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
          .stat-card { background: #f3f4f6; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 4px; }
          .stat-label { color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 5px; }
          .stat-value { font-size: 28px; font-weight: bold; color: #1f2937; }
          .section { margin-bottom: 25px; }
          .section-title { font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #f9fafb; padding: 8px; text-align: left; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; }
          td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
          tr:hover { background: #f9fafb; }
          .footer { background: #f3f4f6; padding: 15px; border-radius: 4px; text-align: center; font-size: 12px; color: #6b7280; }
          .footer a { color: #3b82f6; text-decoration: none; }
          .footer a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Asterley Bros Outreach</h1>
            <p>Weekly Summary — ${dateRange}</p>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Active in Sequence</div>
              <div class="stat-value">${activeInSequence}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Sent (Last 7d)</div>
              <div class="stat-value">${sentLast7Days}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Open Rate (7d)</div>
              <div class="stat-value">${formatPercent(openRateLast7Days)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Reply Rate (7d)</div>
              <div class="stat-value">${formatPercent(replyRateLast7Days)}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Funnel Pipeline (All-time)</div>
            <table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th style="text-align: right;">Count</th>
                </tr>
              </thead>
              <tbody>
                ${stageBreakdown.map(s => `<tr><td>${s.label}</td><td style="text-align: right; font-weight: 600;">${s.count}</td></tr>`).join('')}
                <tr style="font-weight: 600; background: #f0f4ff;">
                  <td>Total Leads</td>
                  <td style="text-align: right;">${totalLeads}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Engagement (Last 7 Days)</div>
            <table>
              <tbody>
                <tr>
                  <td>Sent</td>
                  <td style="text-align: right; font-weight: 600;">${sentLast7Days}</td>
                </tr>
                <tr>
                  <td>Opened</td>
                  <td style="text-align: right;">${openedLast7Days} (${formatPercent(openRateLast7Days)})</td>
                </tr>
                <tr>
                  <td>Replied</td>
                  <td style="text-align: right;">${repliedLast7Days} (${formatPercent(replyRateLast7Days)})</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Pending Queue</div>
            <table>
              <tbody>
                <tr>
                  <td>Approved Emails Ready to Send</td>
                  <td style="text-align: right; font-weight: 600;">${approvedWaiting}</td>
                </tr>
                <tr>
                  <td>Planned Cards Awaiting Draft</td>
                  <td style="text-align: right; font-weight: 600;">${plannedToDraft}</td>
                </tr>
                ${escalationDMsPending > 0 ? `<tr><td>Instagram DM Escalations Pending</td><td style="text-align: right; font-weight: 600; color: #ea580c;">${escalationDMsPending}</td></tr>` : ''}
              </tbody>
            </table>
          </div>

          <div class="footer">
            <p>📊 <a href="https://asterleyleadgen.netlify.app/analytics">View Full Dashboard</a></p>
            <p style="margin-top: 10px; color: #9ca3af;">This is an automated weekly summary. Questions? Check the analytics dashboard.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Scheduled trigger — runs Monday at 9am London time.
 * Sends weekly analytics summary email to all admin users.
 */
export const scheduledAnalyticsSummary = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB", secrets: ["RESEND_API_KEY"] })
  .pubsub.schedule("0 9 * * 1")
  .timeZone("Europe/London")
  .onRun(async () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY not configured");
      return null;
    }

    // 1. Get admin recipient list
    const adminSnap = await db.collection("users").where("role", "==", "admin").get();
    const adminEmails = adminSnap.docs.map(d => d.data().email).filter(Boolean);
    if (!adminEmails.length) {
      console.log("No admin emails found, skipping analytics summary");
      return null;
    }

    // 2. Aggregate data
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [leadsSnap, sentRecentSnap, openedRecentSnap, repliedRecentSnap, approvedSnap, plannedSnap, escalationSnap] = await Promise.all([
      db.collection("leads").get(),
      db.collection("outreach_messages").where("sent_at", ">=", sevenDaysAgo).where("status", "==", "sent").get(),
      db.collection("outreach_messages").where("sent_at", ">=", sevenDaysAgo).where("status", "==", "sent").where("opened", "==", true).get(),
      db.collection("outreach_messages").where("sent_at", ">=", sevenDaysAgo).where("status", "==", "sent").where("has_reply", "==", true).get(),
      db.collection("outreach_messages").where("status", "==", "approved").where("channel", "==", "email").get(),
      db.collection("outreach_messages").where("status", "==", "planned").where("channel", "==", "email").get(),
      db.collection("outreach_messages").where("is_channel_escalation", "==", true).where("status", "in", ["planned", "draft", "approved"]).get(),
    ]);

    const leads = leadsSnap.docs.map(d => d.data());
    const sentLast7 = sentRecentSnap.docs.map(d => d.data());
    const openedLast7 = openedRecentSnap.docs.map(d => d.data());
    const repliedLast7 = repliedRecentSnap.docs.map(d => d.data());

    // Compute stats
    const totalLeads = leads.length;
    const activeInSequence = leads.filter(l => ["sent", "follow_up_1", "follow_up_2"].includes(l.stage)).length;
    const respondedConverted = leads.filter(l => ["responded", "converted"].includes(l.stage)).length;
    const responseRate = (respondedConverted / totalLeads) * 100;
    const converted = leads.filter(l => l.stage === "converted").length;
    const conversionRate = (converted / totalLeads) * 100;

    const sentCount = sentLast7.length;
    const openedCount = openedLast7.length;
    const openRate = sentCount > 0 ? (openedCount / sentCount) * 100 : 0;
    const repliedCount = repliedLast7.length;
    const replyRate = sentCount > 0 ? (repliedCount / sentCount) * 100 : 0;

    const approvedCount = approvedSnap.docs.length;
    const plannedCount = plannedSnap.docs.length;
    const escalationCount = escalationSnap.docs.length;

    // Stage breakdown for table
    const STAGE_ORDER = [
      { key: "sent", label: "Sent (Active)" },
      { key: "follow_up_1", label: "Follow-up 1" },
      { key: "follow_up_2", label: "Follow-up 2" },
      { key: "responded", label: "Responded" },
      { key: "converted", label: "Converted" },
      { key: "no_response", label: "No Response" },
      { key: "declined", label: "Declined" },
    ];
    const stageBreakdown = STAGE_ORDER.map(s => ({
      label: s.label,
      count: leads.filter(l => l.stage === s.key).length,
    }));

    // Date range for header
    const today = new Date();
    const lastMonday = new Date(today);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const dateRange = `${lastMonday.toLocaleDateString("en-GB")} – ${today.toLocaleDateString("en-GB")}`;

    const stats = {
      totalLeads,
      activeInSequence,
      responseRate,
      conversionRate,
      sentLast7Days: sentCount,
      openedLast7Days: openedCount,
      openRateLast7Days: openRate,
      repliedLast7Days: repliedCount,
      replyRateLast7Days: replyRate,
      approvedWaiting: approvedCount,
      plannedToDraft: plannedCount,
      escalationDMsPending: escalationCount,
      stageBreakdown,
      dateRange,
    };

    // 3. Send email to all admins
    const resend = new Resend(apiKey);
    const subject = `Asterley Bros Outreach — Weekly Summary (${today.toLocaleDateString("en-GB")})`;
    const html = buildAnalyticsSummaryHtml(stats);

    for (const email of adminEmails) {
      try {
        await resend.emails.send({
          from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
          to: email,
          subject,
          html,
        });
        console.log(`Analytics summary sent to ${email}`);
      } catch (err) {
        console.error(`Failed to send analytics summary to ${email}:`, err.message);
      }
    }

    console.log(`Analytics summary completed: sent to ${adminEmails.length} admin(s), stats: ${JSON.stringify(stats)}`);
    return null;
  });

// ---- Prompt Rules Generation ----

/**
 * Generate prompt rules from weekly feedback.
 * Scheduled: Monday 6am UTC (London time with DST)
 * Reads recent edit_feedback records, synthesizes durable rules via Claude, stores versioned.
 */
export const generatePromptRules = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB", secrets: ["ANTHROPIC_API_KEY"] })
  .pubsub.schedule("0 6 * * 1")
  .timeZone("Europe/London")
  .onRun(async (context) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY not configured");
      return null;
    }

    const anthropic = new Anthropic({ apiKey });

    try {
      // Fetch recent edit feedback from the last 28 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28);

      const feedbackDocs = await db
        .collection("edit_feedback")
        .where("channel", "==", "email")
        .orderBy("created_at", "desc")
        .limit(200)
        .get();

      if (feedbackDocs.empty) {
        console.log("No edit feedback found; skipping generation");
        return null;
      }

      // Filter to last 28 days and extract venue_category + reflection_notes
      const feedbacks = feedbackDocs.docs
        .map((doc) => ({ ...doc.data(), id: doc.id }))
        .filter((fb) => {
          try {
            return fb.created_at && new Date(fb.created_at) >= thirtyDaysAgo;
          } catch {
            return false;
          }
        });

      if (feedbacks.length < 3) {
        console.log(`Only ${feedbacks.length} feedbacks in last 28 days; skipping generation`);
        return null;
      }

      // Build meta-prompt to synthesize rules
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

      const metaPrompt = `You are reviewing email feedback from sales team members who have been correcting AI-generated cold outreach drafts.

${feedbackText}

Synthesize 5–10 markdown bullet-point rules that capture the most important patterns from these corrections. Rules should be:
- Actionable (tell the AI what to do or avoid)
- Specific to cold outreach emails
- Derived from the patterns seen in the feedback

Return ONLY the bullet-point rules as markdown, no preamble or explanation.`;

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: metaPrompt }],
      });

      const rules_md = response.content[0].text || "";
      if (!rules_md.trim()) {
        console.log("Claude returned empty rules; skipping write");
        return null;
      }

      // Write versioned doc
      const versionId = `v_${Date.now()}`;
      const versionRef = db
        .collection("prompt_config")
        .doc("email_rules")
        .collection("versions")
        .doc(versionId);

      await versionRef.set({
        rules_md,
        generated_at: new Date().toISOString(),
        feedback_count: feedbacks.length,
        version_id: versionId,
      });

      // Update pointer doc (make this the active version)
      const pointerRef = db.collection("prompt_config").doc("email_rules");
      await pointerRef.set(
        {
          active_version_id: versionId,
          generated_at: new Date().toISOString(),
          feedback_count: feedbacks.length,
        },
        { merge: true }
      );

      // Bust cache
      _rulesCache = { rules_md: "", fetched_at: 0 };

      console.log(`Prompt rules generated: version ${versionId} with ${feedbacks.length} feedbacks`);
      return { version_id: versionId, feedback_count: feedbacks.length };
    } catch (err) {
      console.error("generatePromptRules failed:", err.message);
      return null;
    }
  });

/**
 * Switch the active prompt rule version.
 * Callable: admin only
 */
export const setActivePromptVersion = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    // Check admin role
    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!userSnap.exists || userSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Admin access required");
    }

    const { version_id } = data;
    if (!version_id || typeof version_id !== "string") {
      throw new HttpsError("invalid-argument", "version_id (string) required");
    }

    // Verify the version exists
    const versionSnap = await db
      .collection("prompt_config")
      .doc("email_rules")
      .collection("versions")
      .doc(version_id)
      .get();

    if (!versionSnap.exists) {
      throw new HttpsError("not-found", `Version ${version_id} not found`);
    }

    // Update pointer
    await db.collection("prompt_config").doc("email_rules").update({
      active_version_id: version_id,
      updated_at: new Date().toISOString(),
    });

    // Bust cache
    _rulesCache = { rules_md: "", fetched_at: 0 };

    return { status: "success", version_id };
  });

