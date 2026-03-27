import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";

initializeApp();
const db = getFirestore();

const MODEL = "gemini-2.5-pro";

const STEP_INSTRUCTIONS = {
  1: "STEP 1 (First touch): 60-90 words. Introduce who you are. Mention ONE product with ONE serve. Ask to send samples. Close with 'When\\'s good?'",
  2: "STEP 2 (Add value): 50-70 words. Same email thread. Do NOT re-introduce yourself. Add a second product or new serve. CTA: 'Happy to send samples of both.' Subject: 'Re: {previous_subject}'",
  3: "STEP 3 (Seasonal/social proof): 50-80 words. Same thread. Use seasonality or social proof. CTA: 'Offer is always open.' Subject: 'Re: {previous_subject}'",
  4: "STEP 4 (Soft close): 30-50 words. Very short. No new product info. CTA: 'Just let me know.' Subject: 'Re: {previous_subject}'",
};

const EMAIL_TEMPLATE = `Write a short cold email from Rob, founder of Asterley Bros (English Vermouth, Amaro, Aperitivo, based in SE26 London), to a potential stockist.

VENUE: {business_name}
TYPE: {venue_category}
LOCATION: {address}
DRINKS ON MENU: {drinks_programme}
CONTACT: {contact_name} (confidence: {contact_confidence})
TONE: {tone_tier}
SEASON: {current_season}
LEAD PRODUCT: {lead_products}
STEP: {step_number}

{step_instructions}

PRODUCTS (pick ONE, mention ONE serve):
- Schofield's: English Dry Vermouth. Makes the ultimate Martini (and a banging White Negroni).
- Estate: English Sweet Vermouth. For Negronis and Manhattans.
- Rosé: Rosé Vermouth. For Spritzes and Americanos.
- Asterley Original: British Aperitivo, 12%. Makes a cracking Spritz.
- Dispense: Modern British Amaro, 24 botanicals. Digestivo. Spiced Ginger Spritz for summer.
- Britannica: London Fernet. Hanky Panky.

Rob's real emails sound like this. Match this voice EXACTLY:

EMAIL A:
Subject: Quick one about Vermouth

Hi team,

I'm Rob from Asterley Bros, we make English Vermouth and Amaro in SE26. Our Schofield's Dry Vermouth makes a proper Martini. Created it with Joe and Daniel Schofield.

Can I send some samples over for the team?

When's good?

Cheers,

Rob
Asterley Bros
asterleybros.com

EMAIL B (has interesting drink on menu):
Subject: Spritz for summer

Hi team,

Rob here, Asterley Bros, SE26. I saw your Rhubarb Sour on the menu, sounds great. Would love to try that.

We make Asterley Original, a British Aperitivo. Makes a cracking Spritz. Can I send some samples?

When's a good time?

Cheers,

Rob
Asterley Bros
asterleybros.com

EMAIL C (known contact, nearby):
Subject: Vermouth from down the road

Hi Frederic,

Rob from Asterley Bros. We're in SE26, practically neighbours. Our Schofield's Dry Vermouth makes a brilliant Martini.

Happy to drop some samples in next time I'm passing. Are you at the shop most days?

All the best,

Rob
Asterley Bros
asterleybros.com

RULES:
- 60-90 words. Not less than 60, not more than 90.
- ONE product. ONE serve. A second product can go in brackets max.
- If DRINKS ON MENU has a genuinely unusual named cocktail (not Negroni/Martini/Spritz/G&T/Espresso Martini/Old Fashioned), mention it: "I saw your [name] on the menu, sounds great." Otherwise say NOTHING about the venue.
- Use first name if contact confidence is "verified" or "likely." Otherwise "Hi team."
- Title case product names: Schofield's, Dispense, Estate, Rosé, Asterley Original.
- No em dashes or en dashes.
- London venues: suggest popping in. Outside London: suggest sending samples.
- Say "samples" never "bottles." Say "the bar" not "your bar."
- Drop location suffixes from venue names.
- Sign off: Cheers/All the best/Best regards depending on tone. Then Rob, Asterley Bros, asterleybros.com.
- Do NOT compare to Italian or French styles.
- Do NOT compliment the venue concept, vibe, atmosphere, or approach.
- Do NOT use: "genuinely," "distinct," "unique," "versatile," "vibrant," "exceptional," "ambitious," "interesting addition," "great fit," "I noticed," "I've been admiring," "I'm familiar with," "really impressed," "your focus on," "your commitment."
- Every email must have a DIFFERENT subject line. Keep it short (3-7 words).

Output ONLY "Subject:" then the email. Nothing else.`;

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month === 1) return "January (low ABV focus)";
  if (month >= 3 && month <= 6) return "Spring/Summer";
  if (month >= 7 && month <= 8) return "High Summer";
  return "Autumn/Winter";
}

function buildPrompt(lead, enrichment, step = 1, previousSubject = "") {
  const contact = enrichment.contact || {};
  const stepInstr = (STEP_INSTRUCTIONS[step] || STEP_INSTRUCTIONS[1])
    .replace("{previous_subject}", previousSubject);

  return EMAIL_TEMPLATE
    .replace("{business_name}", lead.business_name || "")
    .replace("{venue_category}", enrichment.venue_category || lead.category || "venue")
    .replace("{address}", lead.address || "London")
    .replace("{drinks_programme}", enrichment.drinks_programme || "")
    .replace("{contact_name}", lead.contact_name || contact.name || "")
    .replace("{contact_confidence}", lead.contact_confidence || contact.confidence || "")
    .replace("{tone_tier}", enrichment.tone_tier || "bartender_casual")
    .replace("{current_season}", getCurrentSeason())
    .replace("{lead_products}", (enrichment.lead_products || []).join(", "))
    .replace("{step_number}", String(step))
    .replace("{step_instructions}", stepInstr);
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
export const generateDrafts = onCall(
  { timeoutSeconds: 540, memory: "512MiB", secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "GEMINI_API_KEY not configured.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const leadIds = request.data?.lead_ids || null;

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

    let generated = 0;
    let failed = 0;

    for (const leadDoc of docs) {
      try {
        const enrichment = leadDoc.enrichment || {};
        const prompt = buildPrompt(leadDoc, enrichment);

        const response = await ai.models.generateContent({
          model: MODEL,
          contents: prompt,
        });

        let content = response.text || "";
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
  }
);

/**
 * Regenerate a single draft.
 * Called from frontend: regenerateDraft({ message_id, lead_id })
 */
export const regenerateDraft = onCall(
  { timeoutSeconds: 60, memory: "256MiB", secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "GEMINI_API_KEY not configured.");
    }

    const { message_id, lead_id } = request.data;
    if (!message_id || !lead_id) {
      throw new HttpsError("invalid-argument", "message_id and lead_id required.");
    }

    const ai = new GoogleGenAI({ apiKey });

    const leadSnap = await db.collection("leads").doc(lead_id).get();
    if (!leadSnap.exists) {
      throw new HttpsError("not-found", "Lead not found.");
    }

    const leadDoc = leadSnap.data();
    const enrichment = leadDoc.enrichment || {};
    const prompt = buildPrompt(leadDoc, enrichment);

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    let content = response.text || "";
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
  }
);

/**
 * Regenerate ALL drafts (delete existing, create new).
 */
export const regenerateAllDrafts = onCall(
  { timeoutSeconds: 540, memory: "512MiB", secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    // Check admin role
    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    if (!userSnap.exists || userSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "GEMINI_API_KEY not configured.");
    }

    const ai = new GoogleGenAI({ apiKey });

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

        const response = await ai.models.generateContent({
          model: MODEL,
          contents: prompt,
        });

        let content = response.text || "";
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
  }
);

// ---- Outreach Plan ----

const SEASONS = {
  spring_summer: { months: [3,4,5,6], products: ["ASTERLEY ORIGINAL","SCHOFIELD'S","ROSÉ","DISPENSE"], hook: "Spring/Summer menus", serves: "Spritzes, White Negronis, highballs" },
  high_summer: { months: [7,8], products: ["ASTERLEY ORIGINAL","ROSÉ","RED"], hook: "terrace season", serves: "Spritzes, long drinks, pre-batched Negronis" },
  autumn_winter: { months: [9,10,11,12,2], products: ["ESTATE","DISPENSE","BRITANNICA","ASTERLEY ORIGINAL"], hook: "Autumn/Winter menus", serves: "Negronis, Manhattans, digestivos" },
  january: { months: [1], products: ["SCHOFIELD'S","ESTATE","DISPENSE"], hook: "Dry January / low ABV", serves: "Reverse Martini, Americano, low ABV Spritzes" },
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

export const getOutreachPlan = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const limit = request.data?.limit || 15;
    const leadsSnap = await db.collection("leads").get();
    const docs = leadsSnap.docs.map(d => d.data());

    if (!docs.length) {
      return { season: "unknown", recommended: [], total_eligible: 0, weekly_target: 100, weekly_progress: { total: 0, remaining: 100, by_category: {} }, scrape_recommendations: [], generated_at: new Date().toISOString() };
    }

    const season = getSeason();
    const seasonCfg = SEASONS[season];
    const catPriority = SEASONAL_CAT_PRIORITY[season] || {};
    const sendWindow = getSendWindow();

    console.log(`getOutreachPlan: ${docs.length} total leads`);
    const withEmail = docs.filter(d => d.email).length;
    console.log(`getOutreachPlan: ${withEmail} have email`);

    const scoredLeads = [];
    for (const lead of docs) {
      if (!lead.email) continue;
      const stage = lead.stage || "";
      if (["sent","follow_up_1","follow_up_2","responded","converted","declined"].includes(stage)) continue;

      const e = lead.enrichment || {};
      const venueCat = e.venue_category || "other";
      const menuFit = e.menu_fit || "unknown";
      const leadProducts = e.lead_products || [];
      const contact = e.contact || {};

      let priority = 0;
      const reasons = [];

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
        lead_id: lead.id || "",
        business_name: lead.business_name || "",
        venue_category: venueCat,
        email: lead.email,
        priority,
        reasons: reasons.slice(0, 3),
        lead_products: overlap.length ? overlap : leadProducts.slice(0, 2),
        seasonal_hook: seasonCfg.hook,
        suggested_serves: seasonCfg.serves,
        contact_name: contact.name || null,
        menu_fit: menuFit,
        score: score || null,
      });
    }

    scoredLeads.sort((a, b) => b.priority - a.priority);

    return {
      season,
      seasonal_hook: seasonCfg.hook,
      seasonal_products: seasonCfg.products,
      seasonal_serves: seasonCfg.serves,
      send_window: sendWindow,
      total_eligible: scoredLeads.length,
      recommended: scoredLeads.slice(0, limit),
      weekly_target: 100,
      weekly_progress: { total: docs.length, remaining: Math.max(0, 100 - docs.length), by_category: {} },
      scrape_recommendations: [],
      generated_at: new Date().toISOString(),
    };
  }
);

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

export const getStrategy = onCall(
  { timeoutSeconds: 60, memory: "256MiB", secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
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
  }
);

// ---- User Deletion ----

/**
 * Fully delete a user: Auth + Firestore.
 */
export const deleteUser = onCall(
  { timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    // Check caller is admin
    const callerSnap = await db.collection("users").doc(request.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "Admin only.");
    }

    const { uid } = request.data;
    if (!uid) throw new HttpsError("invalid-argument", "uid required.");

    // Don't let admin delete themselves
    if (uid === request.auth.uid) {
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
  }
);
