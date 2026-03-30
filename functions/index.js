import functions from "firebase-functions/v1";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import sgMail from "@sendgrid/mail";

const HttpsError = functions.https.HttpsError;

initializeApp();
const db = getFirestore();

const CLAUDE_MODEL = "claude-sonnet-4-20250514";

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
  1: `STEP 1 (First touch). 120-160 words. New thread.
Structure:
1. Greeting
2. 1-2 sentences: Who we are + why we're writing. Direct, warm, genuine.
3. [blank line] 1 sentence: Early CTA. "Can I send some samples?" or "Can I pop in one afternoon with some samples?"
4. [blank line] 2-3 sentences: Product detail. Specific product, specific serve, why it's relevant. This is the substance.
5. 1-2 sentences: Venue/brand observation IF genuinely interesting. Woven in naturally, NOT front-loaded flattery.
6. 1 sentence: Closing CTA. "When's a good time to catch you?" / "When's good?"
7. [blank line] Sign-off, Rob, Asterley Bros, asterleybros.com

Two CTAs: soft early ("Can I send samples?") + direct close ("When's good?").`,

  2: `STEP 2 (Add value). 80-100 words. Same thread. Subject: "Re: {previous_subject}"
Do NOT re-introduce who we are. The thread provides context.
Add a SECOND product, a new serve, or a specific angle not mentioned in step 1.
Shorter, punchier. New information only.
CTA: "Happy to send samples of both. Let me know."`,

  3: `STEP 3 (Seasonal/social proof). 80-110 words. Same thread. Subject: "Re: {previous_subject}"
Do NOT re-introduce who we are.
Use seasonality ("Spring menus are being finalised across London right now") or social proof ("several independent bars have picked it up this season").
Can mention BiB here if relevant to high-volume venues.
CTA: "Offer is always open. Happy to send samples whenever works."`,

  4: `STEP 4 (Soft close). 50-90 words. Subject: "Re: {previous_subject}" (or NEW subject if they never opened previous emails).
Very short. Respectful. No new product info. Door left open.
CTA: "Just reply to this email and I'll get samples sent." / "Just let me know."
Never guilt-trip. No "I haven't heard back" or "I'm sure you're busy."
Tone: gracious.`,
};

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
- Schofield's: English Dry Vermouth, 16%. Created with bartenders Joe and Daniel Schofield. Crisp, herbaceous. The ultimate Martini (and a banging White Negroni too!).
- Estate: English Sweet Vermouth, 16%. Rich, full-bodied. The go-to for Negronis. Brilliant in Manhattans.
- Rosé: Rosé Vermouth, 15%. Value-conscious, strong in BiB. Rosé Americano, Rosé Spritz.
- RED: Value sweet vermouth, 15%. For high-volume venues, pubs. Solid Negroni at a keen price.
- Asterley Original: British Aperitivo, 12%. Bright, citrusy. Brilliant Campari alternative. Makes a cracking Spritz. Does NOT go in classic Negronis (that needs Dispense or Estate).
- Dispense: Modern British Amaro, 26%. Flagship. 24 botanicals. Pinot Noir base. Primarily a digestivo. Spiced Ginger Spritz (with lime, topped with Ginger Ale) for summer.
- Britannica: London Fernet, 40%. Bold, complex, minty. Hanky Panky. Toronto with rye.

CRITICAL: Dispense (amaro, 26%) goes into Negronis, Boulevardiers, Americanos. Asterley Original (aperitivo, 12%) goes into Spritzes, Pink Negronis, lighter twists. They are NOT interchangeable.

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

BENCHMARK EMAIL (this is the gold standard — match this voice, energy, and warmth):

Hi Tom,

Saw the TimeOut piece recently and it looked great! Congrats!

I was hoping to drop in and say hello next week if you were around?

Quick intro: I'm Rob from Asterley Bros, makers of English Vermouth and Amaro based in SE26. We make a delicious English Dry Vermouth called Schofield's (created with bartenders Joe and Daniel Schofield) that is designed to make the ultimate Martini (and a banging White Negroni too!). Crisp and herbaceous with a distinctly British character. Quite different from other classic Vermouth styles, and I thought it might work well in any upcoming Spring menus you were working on.

I'd love to swing by, try one of your stirred-down classics, and leave you with some samples to play with. No pitch, just a tasting.

When's a good time to catch you?

Cheers,

Rob
Asterley Bros
asterleybros.com

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

function hasEnrichment(doc) {
  const e = doc.enrichment || {};
  return !!(
    e.venue_category &&
    (e.context_notes || e.drinks_programme || e.business_summary)
  );
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
        (d) => d.email && hasEnrichment(d) && !leadsWithDrafts.has(d.id)
      );
    }

    // Batch limit to avoid timeout
    docs = docs.slice(0, 20);

    let generated = 0;
    let failed = 0;

    for (const leadDoc of docs) {
      try {
        const enrichment = leadDoc.enrichment || {};
        const prompt = buildPrompt(leadDoc, enrichment);

        const response = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system: EMAIL_SYSTEM_PROMPT,
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
          created_at: new Date().toISOString(),
          tone_tier: enrichment.tone_tier || null,
          lead_products: enrichment.lead_products || [],
          contact_name: leadDoc.contact_name || contact.name || null,
          context_notes: enrichment.context_notes || null,
          menu_fit: enrichment.menu_fit || null,
          recipient_email: leadDoc.email || leadDoc.contact_email || null,
          workspace_id: leadDoc.workspace_id || "",
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
    const prompt = buildPrompt(leadDoc, enrichment);

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: EMAIL_SYSTEM_PROMPT,
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
      .filter((d) => d.email && hasEnrichment(d));

    let generated = 0;
    let failed = 0;

    for (const leadDoc of docs) {
      try {
        const enrichment = leadDoc.enrichment || {};
        const prompt = buildPrompt(leadDoc, enrichment);

        const response = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system: EMAIL_SYSTEM_PROMPT,
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
          created_at: new Date().toISOString(),
          tone_tier: enrichment.tone_tier || null,
          lead_products: enrichment.lead_products || [],
          contact_name: leadDoc.contact_name || contact.name || null,
          context_notes: enrichment.context_notes || null,
          menu_fit: enrichment.menu_fit || null,
          recipient_email: leadDoc.email || leadDoc.contact_email || null,
          workspace_id: leadDoc.workspace_id || "",
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
  spring_summer: { cocktail_bar:10, wine_bar:9, hotel_bar:8, italian_restaurant:8, bottle_shop:7, gastropub:6, restaurant_groups:5 },
  high_summer: { gastropub:10, hotel_bar:9, cocktail_bar:8, wine_bar:7 },
  autumn_winter: { cocktail_bar:10, hotel_bar:9, italian_restaurant:9, wine_bar:8, restaurant_groups:7 },
  january: { wine_bar:10, cocktail_bar:9, hotel_bar:8, gastropub:7, bottle_shop:6 },
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

// ---- Send Approved Emails via SendGrid ----

const SENDER_EMAIL = "rob@asterleybros.com";
const SENDER_NAME = "Rob from Asterley Bros";
const DAILY_CAP = 150;

function isOptimalWindow() {
  const now = new Date();
  const london = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const day = london.getDay(); // 0=Sun
  const hour = london.getHours();
  const isBestDay = [2, 3, 4].includes(day); // Tue, Wed, Thu
  const isBestTime = hour >= 10 && hour < 13;
  return isBestDay && isBestTime;
}

export const sendApproved = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB", secrets: ["SENDGRID_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!userSnap.exists || userSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only.");
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

    if (!messages.length) {
      return { status: "completed", sent: 0, failed: 0, total: 0 };
    }

    const toSend = messages.slice(0, remaining);

    // Init SendGrid
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) throw new HttpsError("failed-precondition", "SENDGRID_API_KEY not configured.");
    sgMail.setApiKey(apiKey);

    let sent = 0;
    let failed = 0;

    for (const msg of toSend) {
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

        await sgMail.send({
          to: toEmail,
          from: { email: SENDER_EMAIL, name: SENDER_NAME },
          subject: msg.subject || "Asterley Bros",
          text: msg.content,
        });

        const now = new Date().toISOString();
        await db.collection("outreach_messages").doc(msg.id).update({
          status: "sent",
          sent_at: now,
        });

        await db.collection("leads").doc(msg.lead_id).update({
          stage: "sent",
        });

        sent++;
        console.log("Sent to", toEmail, "for", lead.business_name);
      } catch (err) {
        console.error("Send failed for", msg.id, err.message);
        await db.collection("outreach_messages").doc(msg.id).update({
          status: "bounced",
        });
        failed++;
      }
    }

    return { status: "completed", sent, failed, total: toSend.length };
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

    // Delete Firestore user doc
    await db.collection("users").doc(uid).delete();

    return { status: "deleted", uid };
  });
