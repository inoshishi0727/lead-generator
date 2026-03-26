import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
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
