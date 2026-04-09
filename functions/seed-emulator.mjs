/**
 * Seed the Firestore emulator with test data for follow-up sequence testing.
 *
 * Usage:
 *   firebase emulators:start --only firestore,functions
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node functions/seed-emulator.mjs
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "crypto";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("ERROR: FIRESTORE_EMULATOR_HOST not set.\nRun: firebase emulators:start --only firestore,functions");
  process.exit(1);
}

const app = getApps().length === 0
  ? initializeApp({ projectId: "asterley-bros-b29c0" })
  : getApps()[0];
const db = getFirestore(app);

// ---- Helpers ----

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function minutesFromNow(n) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + n);
  return d.toISOString();
}

async function seedLead(id, overrides = {}) {
  const now = new Date().toISOString();
  const lead = {
    id,
    source: "manual",
    business_name: "Test Venue",
    address: "123 Test Street, London SE1 1AA",
    email: `${id}@testbar.com`,
    email_found: true,
    contact_name: "Test Contact",
    contact_email: `${id}@testbar.com`,
    contact_role: "Owner",
    contact_confidence: "verified",
    stage: "sent",
    score: 75,
    category: "cocktail_bar",
    client_status: null,
    human_takeover: false,
    human_takeover_at: null,
    reply_count: 0,
    outcome: null,
    enrichment: {
      venue_category: "cocktail_bar",
      business_summary: "A stylish cocktail bar known for creative drinks and relaxed atmosphere",
      location_area: "London SE1",
      menu_fit: "strong",
      menu_fit_signals: ["cocktail-focused menu", "premium spirits selection", "aperitivo offerings"],
      drinks_programme: "Extensive cocktail menu with classic and contemporary serves, curated spirit selection",
      why_asterley_fits: "Their cocktail-forward approach and aperitivo focus makes them a natural fit for English vermouth",
      context_notes: "Seeded test data",
      lead_products: ["Schofield's", "Dispense"],
      tone_tier: "bartender_casual",
      opening_hours_summary: "Mon-Sat 5pm-midnight, Sun 4pm-10pm",
      price_tier: "mid-premium",
      ai_approval: "yes",
      ai_approval_reason: "Strong cocktail programme with aperitivo focus — ideal for vermouth placement",
      enrichment_source: "website",
      enrichment_status: "success",
      enrichment_error: null,
      contact: {
        name: overrides.contact_name || "Test Contact",
        role: overrides.contact_role || "Owner",
        confidence: "verified",
      },
    },
    scraped_at: now,
    updated_at: now,
    workspace_id: "",
    ...overrides,
  };
  await db.collection("leads").doc(id).set(lead);
  return lead;
}

async function seedMessage(leadId, stepNumber, status, sentDaysAgo, overrides = {}) {
  const id = overrides.id || randomUUID();
  const LABELS = { 1: "initial", 2: "1st follow up", 3: "2nd follow up", 4: "3rd follow up" };
  const msg = {
    id,
    lead_id: leadId,
    business_name: overrides.business_name || "Test Venue",
    venue_category: "cocktail_bar",
    channel: "email",
    subject: stepNumber === 1
      ? "English Vermouth for the cocktail menu"
      : `Re: English Vermouth for the cocktail menu`,
    content: `Test email content for step ${stepNumber}.`,
    status,
    step_number: stepNumber,
    follow_up_label: LABELS[stepNumber],
    scheduled_send_date: overrides.scheduled_send_date || null,
    created_at: daysAgo(sentDaysAgo),
    sent_at: status === "sent" ? daysAgo(sentDaysAgo) : null,
    tone_tier: "bartender_casual",
    lead_products: ["Schofield's", "Dispense"],
    contact_name: overrides.contact_name || "Test Contact",
    context_notes: "Seeded test data",
    menu_fit: "strong",
    recipient_email: overrides.recipient_email || `${leadId}@testbar.com`,
    website: null,
    workspace_id: "",
    original_content: `Test email content for step ${stepNumber}.`,
    original_subject: null,
    was_edited: false,
    has_reply: overrides.has_reply || false,
    reply_count: overrides.reply_count || 0,
    ...overrides,
  };
  await db.collection("outreach_messages").doc(id).set(msg);
  return msg;
}

async function seedReply(leadId, overrides = {}) {
  const id = overrides.id || randomUUID();
  const reply = {
    id,
    lead_id: leadId,
    message_id: overrides.message_id || null,
    from_email: overrides.from_email || `${leadId}@testbar.com`,
    from_name: overrides.from_name || "Test Contact",
    subject: "Re: English Vermouth for the cocktail menu",
    body: overrides.body || "Thanks for reaching out! We'd love to try some samples.",
    body_raw: overrides.body || "Thanks for reaching out! We'd love to try some samples.",
    body_html: "",
    source: "resend",
    direction: "inbound",
    matched: true,
    matched_by: "plus_address",
    is_auto_reply: false,
    sentiment: overrides.sentiment || "positive",
    sentiment_reason: overrides.sentiment_reason || "Expressed interest in samples",
    created_at: overrides.created_at || new Date().toISOString(),
    ...overrides,
  };
  await db.collection("inbound_replies").doc(id).set(reply);
  return reply;
}

// ---- Clear existing data ----

async function clearCollections() {
  for (const name of ["leads", "outreach_messages", "inbound_replies"]) {
    const snap = await db.collection(name).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`  Cleared ${snap.size} docs from ${name}`);
  }
}

// ---- Seed scenarios ----

async function seed() {
  console.log("\nClearing existing data...");
  await clearCollections();

  console.log("\nSeeding test scenarios...\n");

  // ──────────────────────────────────────────────
  // A: "The Cocktail Club" — ready for 1st follow up
  //    Initial sent 7 days ago. Step 2 draft approved, scheduled to send today.
  // ──────────────────────────────────────────────
  const leadA = "lead-a-cocktail-club";
  await seedLead(leadA, {
    business_name: "The Cocktail Club",
    contact_name: "Sophie",
    email: "sophie@cocktailclub.com",
    contact_email: "sophie@cocktailclub.com",
    enrichment: {
      venue_category: "cocktail_bar",
      business_summary: "Vibrant Soho cocktail bar known for creative seasonal menus and classic serves with a twist",
      location_area: "Soho, London W1",
      menu_fit: "strong",
      menu_fit_signals: ["Negroni variations on menu", "seasonal cocktail rotation", "aperitivo hour 5-7pm"],
      drinks_programme: "Rotating seasonal cocktail menu, strong Negroni selection, aperitivo hour with Italian-inspired serves",
      why_asterley_fits: "Their aperitivo hour and Negroni focus is a perfect showcase for English vermouth",
      context_notes: "Recently posted about their new spring aperitivo menu on Instagram. Known for creative twists on Italian classics.",
      lead_products: ["Schofield's", "Dispense"],
      tone_tier: "bartender_casual",
      opening_hours_summary: "Mon-Sat 5pm-1am, Sun closed",
      price_tier: "premium",
      ai_approval: "yes",
      ai_approval_reason: "Aperitivo-focused with strong cocktail credentials — high conversion potential",
      enrichment_source: "website",
      enrichment_status: "success",
      enrichment_error: null,
      contact: { name: "Sophie", role: "Bar Manager", confidence: "verified" },
    },
  });
  await seedMessage(leadA, 1, "sent", 7, {
    business_name: "The Cocktail Club",
    contact_name: "Sophie",
    recipient_email: "sophie@cocktailclub.com",
  });
  await seedMessage(leadA, 2, "approved", 0, {
    business_name: "The Cocktail Club",
    contact_name: "Sophie",
    recipient_email: "sophie@cocktailclub.com",
    scheduled_send_date: today(),
  });
  console.log("  [A] The Cocktail Club — stage:sent, step 2 approved & scheduled today");

  // ──────────────────────────────────────────────
  // B: "Bar Valentino" — ready for 2nd follow up
  //    Initial sent 14 days ago, step 2 sent 7 days ago. Step 3 draft approved for today.
  // ──────────────────────────────────────────────
  const leadB = "lead-b-bar-valentino";
  await seedLead(leadB, {
    business_name: "Bar Valentino",
    contact_name: "Marco",
    email: "marco@barvalentino.com",
    contact_email: "marco@barvalentino.com",
    stage: "follow_up_1",
    enrichment: {
      venue_category: "italian_restaurant",
      business_summary: "Authentic Italian restaurant and bar in Clerkenwell with a curated aperitivo programme",
      location_area: "Clerkenwell, London EC1",
      menu_fit: "strong",
      menu_fit_signals: ["dedicated aperitivo menu", "Negroni on cocktail list", "Italian wine and spirits focus"],
      drinks_programme: "Italian-leaning cocktail list, Aperol Spritz, Negroni, curated amaro selection, Italian wines",
      why_asterley_fits: "English vermouth in their Negroni would be a talking point — Italian tradition meets British craft",
      context_notes: "Family-run, Marco is the owner and handles drinks buying. Active on Instagram showcasing aperitivo.",
      lead_products: ["Schofield's", "Dispense", "BiB"],
      tone_tier: "bartender_casual",
      opening_hours_summary: "Tue-Sat 12pm-11pm, Sun 12pm-9pm, Mon closed",
      price_tier: "mid-premium",
      ai_approval: "yes",
      ai_approval_reason: "Italian venue with aperitivo focus — vermouth is core to their identity",
      enrichment_source: "website",
      enrichment_status: "success",
      enrichment_error: null,
      contact: { name: "Marco", role: "Owner", confidence: "verified" },
    },
  });
  await seedMessage(leadB, 1, "sent", 14, {
    business_name: "Bar Valentino",
    contact_name: "Marco",
    recipient_email: "marco@barvalentino.com",
  });
  await seedMessage(leadB, 2, "sent", 7, {
    business_name: "Bar Valentino",
    contact_name: "Marco",
    recipient_email: "marco@barvalentino.com",
  });
  await seedMessage(leadB, 3, "approved", 0, {
    business_name: "Bar Valentino",
    contact_name: "Marco",
    recipient_email: "marco@barvalentino.com",
    scheduled_send_date: today(),
  });
  console.log("  [B] Bar Valentino — stage:follow_up_1, step 3 approved & scheduled today");

  // ──────────────────────────────────────────────
  // C: "The Negroni Bar" — ready for 3rd (final) follow up
  //    Initial sent 18 days ago, steps 2+3 sent. Step 4 draft approved for today.
  // ──────────────────────────────────────────────
  const leadC = "lead-c-negroni-bar";
  await seedLead(leadC, {
    business_name: "The Negroni Bar",
    contact_name: "Luca",
    email: "luca@negronibar.com",
    contact_email: "luca@negronibar.com",
    stage: "follow_up_2",
    enrichment: {
      venue_category: "cocktail_bar",
      business_summary: "Negroni-specialist bar in Shoreditch with 30+ vermouth-based serves on the menu",
      location_area: "Shoreditch, London E1",
      menu_fit: "excellent",
      menu_fit_signals: ["vermouth flights on menu", "30+ Negroni variations", "dedicated vermouth back bar"],
      drinks_programme: "Negroni-focused with an extensive vermouth collection, weekly specials, vermouth flights",
      why_asterley_fits: "A vermouth-specialist bar is the dream placement — their audience actively seeks new vermouths",
      context_notes: "High-profile venue, frequently featured in drinks press. Luca is head bartender and buying decision maker.",
      lead_products: ["Schofield's", "Dispense"],
      tone_tier: "bartender_casual",
      opening_hours_summary: "Wed-Sun 5pm-midnight, Mon-Tue closed",
      price_tier: "premium",
      ai_approval: "yes",
      ai_approval_reason: "Vermouth-specialist venue — highest possible relevance",
      enrichment_source: "website",
      enrichment_status: "success",
      enrichment_error: null,
      contact: { name: "Luca", role: "Head Bartender", confidence: "high" },
    },
  });
  await seedMessage(leadC, 1, "sent", 18, {
    business_name: "The Negroni Bar",
    contact_name: "Luca",
    recipient_email: "luca@negronibar.com",
  });
  await seedMessage(leadC, 2, "sent", 11, {
    business_name: "The Negroni Bar",
    contact_name: "Luca",
    recipient_email: "luca@negronibar.com",
  });
  await seedMessage(leadC, 3, "sent", 4, {
    business_name: "The Negroni Bar",
    contact_name: "Luca",
    recipient_email: "luca@negronibar.com",
  });
  await seedMessage(leadC, 4, "approved", 0, {
    business_name: "The Negroni Bar",
    contact_name: "Luca",
    recipient_email: "luca@negronibar.com",
    scheduled_send_date: today(),
  });
  console.log("  [C] The Negroni Bar — stage:follow_up_2, step 4 (soft close) approved & scheduled today");

  // ──────────────────────────────────────────────
  // D: "Closed Door Bar" — sequence complete
  //    All 4 steps sent, stage no_response.
  // ──────────────────────────────────────────────
  const leadD = "lead-d-closed-door";
  await seedLead(leadD, {
    business_name: "Closed Door Bar",
    contact_name: "Alex",
    email: "alex@closeddoor.com",
    contact_email: "alex@closeddoor.com",
    stage: "no_response",
    enrichment: {
      venue_category: "speakeasy",
      business_summary: "Members-only speakeasy in Dalston with a focus on rare spirits and bespoke cocktails",
      location_area: "Dalston, London E8",
      menu_fit: "moderate",
      menu_fit_signals: ["bespoke cocktail menu", "rare spirits collection", "no fixed menu"],
      drinks_programme: "Bespoke cocktails only, no fixed menu, rare and unusual spirits focus",
      why_asterley_fits: "Small-batch English vermouth would fit their rare/unusual positioning",
      context_notes: "Hard to reach — members-only, no public email. Alex found via industry contact.",
      lead_products: ["Schofield's"],
      tone_tier: "industry_peer",
      opening_hours_summary: "Thu-Sat 8pm-2am, members only",
      price_tier: "ultra-premium",
      ai_approval: "maybe",
      ai_approval_reason: "Good fit but hard to access — members-only model may limit volume",
      enrichment_source: "website",
      enrichment_status: "success",
      enrichment_error: null,
      contact: { name: "Alex", role: "Founder", confidence: "uncertain" },
    },
  });
  await seedMessage(leadD, 1, "sent", 20, {
    business_name: "Closed Door Bar",
    contact_name: "Alex",
    recipient_email: "alex@closeddoor.com",
  });
  await seedMessage(leadD, 2, "sent", 13, {
    business_name: "Closed Door Bar",
    contact_name: "Alex",
    recipient_email: "alex@closeddoor.com",
  });
  await seedMessage(leadD, 3, "sent", 6, {
    business_name: "Closed Door Bar",
    contact_name: "Alex",
    recipient_email: "alex@closeddoor.com",
  });
  await seedMessage(leadD, 4, "sent", 2, {
    business_name: "Closed Door Bar",
    contact_name: "Alex",
    recipient_email: "alex@closeddoor.com",
  });
  console.log("  [D] Closed Door Bar — stage:no_response, all 4 steps sent (sequence complete)");

  // ──────────────────────────────────────────────
  // E: "The Gin Palace" — has reply, should cancel follow-ups
  //    Initial sent 8 days ago. Reply received. Follow-up should be blocked.
  // ──────────────────────────────────────────────
  const leadE = "lead-e-gin-palace";
  await seedLead(leadE, {
    business_name: "The Gin Palace",
    contact_name: "Hannah",
    email: "hannah@ginpalace.com",
    contact_email: "hannah@ginpalace.com",
    stage: "responded",
    human_takeover: true,
    human_takeover_at: daysAgo(2),
    reply_count: 1,
    enrichment: {
      venue_category: "gin_bar",
      business_summary: "Gin-focused bar in Islington with over 200 gins and a growing cocktail programme",
      location_area: "Islington, London N1",
      menu_fit: "moderate",
      menu_fit_signals: ["gin & tonic focus", "growing cocktail menu", "recently added Martini section"],
      drinks_programme: "200+ gin selection, classic G&Ts, recently expanded into Martinis and stirred drinks",
      why_asterley_fits: "Their Martini expansion is the entry point — Schofield's is designed for the ultimate Martini",
      context_notes: "Hannah is enthusiastic about trying new products. Replied positively to initial outreach.",
      lead_products: ["Schofield's"],
      tone_tier: "bartender_casual",
      opening_hours_summary: "Mon-Sun 4pm-midnight",
      price_tier: "mid-premium",
      ai_approval: "yes",
      ai_approval_reason: "Martini expansion creates a natural opening for vermouth",
      enrichment_source: "website",
      enrichment_status: "success",
      enrichment_error: null,
      contact: { name: "Hannah", role: "General Manager", confidence: "verified" },
    },
  });
  const msgE1 = await seedMessage(leadE, 1, "sent", 8, {
    business_name: "The Gin Palace",
    contact_name: "Hannah",
    recipient_email: "hannah@ginpalace.com",
    has_reply: true,
    reply_count: 1,
  });
  await seedReply(leadE, {
    message_id: msgE1.id,
    from_email: "hannah@ginpalace.com",
    from_name: "Hannah",
    body: "Hi! Yes we'd love to try some samples. Can you come by next Tuesday?",
    sentiment: "positive",
    sentiment_reason: "Wants to schedule a tasting",
    created_at: daysAgo(2),
  });
  console.log("  [E] The Gin Palace — has inbound reply, follow-ups should be cancelled");

  // ──────────────────────────────────────────────
  // F: "Aperitivo House" — reply mid-sequence
  //    Steps 1+2 sent, reply came after step 2. Stage responded, human_takeover.
  // ──────────────────────────────────────────────
  const leadF = "lead-f-aperitivo-house";
  await seedLead(leadF, {
    business_name: "Aperitivo House",
    contact_name: "Giulia",
    email: "giulia@aperitivohouse.com",
    contact_email: "giulia@aperitivohouse.com",
    stage: "responded",
    human_takeover: true,
    human_takeover_at: daysAgo(1),
    reply_count: 1,
    enrichment: {
      venue_category: "wine_bar",
      business_summary: "Italian-inspired wine and aperitivo bar in Bermondsey with a focus on vermouth and amaro",
      location_area: "Bermondsey, London SE1",
      menu_fit: "excellent",
      menu_fit_signals: ["vermouth-based cocktails on menu", "aperitivo platters", "Italian spirits focus"],
      drinks_programme: "Aperitivo cocktails, Italian wines, vermouth serves, amaro collection, Spritz variations",
      why_asterley_fits: "They already serve vermouth — English vermouth gives them a local, craft story to tell",
      context_notes: "Giulia declined — not looking for new suppliers right now. Revisit in 3 months.",
      lead_products: ["Schofield's", "Dispense", "BiB"],
      tone_tier: "bartender_casual",
      opening_hours_summary: "Tue-Sun 12pm-11pm, Mon closed",
      price_tier: "mid-premium",
      ai_approval: "yes",
      ai_approval_reason: "Already serving vermouth — direct product swap opportunity",
      enrichment_source: "website",
      enrichment_status: "success",
      enrichment_error: null,
      contact: { name: "Giulia", role: "Owner", confidence: "verified" },
    },
  });
  await seedMessage(leadF, 1, "sent", 14, {
    business_name: "Aperitivo House",
    contact_name: "Giulia",
    recipient_email: "giulia@aperitivohouse.com",
  });
  const msgF2 = await seedMessage(leadF, 2, "sent", 7, {
    business_name: "Aperitivo House",
    contact_name: "Giulia",
    recipient_email: "giulia@aperitivohouse.com",
    has_reply: true,
    reply_count: 1,
  });
  await seedReply(leadF, {
    message_id: msgF2.id,
    from_email: "giulia@aperitivohouse.com",
    from_name: "Giulia",
    body: "We're not looking for new suppliers at the moment, but thanks.",
    sentiment: "negative",
    sentiment_reason: "Not interested currently",
    created_at: daysAgo(1),
  });
  console.log("  [F] Aperitivo House — reply mid-sequence (after step 2), follow-ups cancelled");

  // ──────────────────────────────────────────────
  // G: "Snoozed Venue" — client_status snoozed
  //    Initial sent 10 days ago, but snoozed. Should be skipped.
  // ──────────────────────────────────────────────
  const leadG = "lead-g-snoozed-venue";
  await seedLead(leadG, {
    business_name: "The Snoozed Lounge",
    contact_name: "Oliver",
    email: "oliver@snoozedlounge.com",
    contact_email: "oliver@snoozedlounge.com",
    client_status: "snoozed",
    enrichment: {
      venue_category: "hotel_bar",
      business_summary: "Boutique hotel bar in Covent Garden with a classic cocktail programme",
      location_area: "Covent Garden, London WC2",
      menu_fit: "strong",
      menu_fit_signals: ["Martini menu", "classic cocktail focus", "premium spirits"],
      drinks_programme: "Classic cocktails, Martini menu, premium spirits, hotel guest-oriented",
      why_asterley_fits: "Hotel bars move high volumes of Martinis and Negronis — BiB format ideal",
      context_notes: "Oliver asked to be contacted again in Q3 — snoozed until then.",
      lead_products: ["Schofield's", "BiB"],
      tone_tier: "formal_professional",
      opening_hours_summary: "Daily 11am-1am",
      price_tier: "premium",
      ai_approval: "yes",
      ai_approval_reason: "High-volume hotel bar with classic cocktail focus",
      enrichment_source: "website",
      enrichment_status: "success",
      enrichment_error: null,
      contact: { name: "Oliver", role: "Head of Beverage", confidence: "verified" },
    },
  });
  await seedMessage(leadG, 1, "sent", 10, {
    business_name: "The Snoozed Lounge",
    contact_name: "Oliver",
    recipient_email: "oliver@snoozedlounge.com",
  });
  console.log("  [G] The Snoozed Lounge — client_status:snoozed, should be skipped");

  // ──────────────────────────────────────────────
  // H: "Fresh Send" — too early for follow-up
  //    Initial sent only 2 days ago. Way too early.
  // ──────────────────────────────────────────────
  const leadH = "lead-h-fresh-send";
  await seedLead(leadH, {
    business_name: "The Fresh Bar",
    contact_name: "James",
    email: "james@freshbar.com",
    contact_email: "james@freshbar.com",
    enrichment: {
      venue_category: "cocktail_bar",
      business_summary: "New opening in Peckham with a modern British cocktail programme and local sourcing ethos",
      location_area: "Peckham, London SE15",
      menu_fit: "strong",
      menu_fit_signals: ["British ingredients focus", "modern cocktail menu", "local sourcing ethos"],
      drinks_programme: "Modern British cocktails, locally sourced spirits, seasonal menu changes",
      why_asterley_fits: "Their British sourcing ethos is exactly our story — English vermouth made in South London",
      context_notes: "Brand new venue, just opened last month. James is the owner-operator.",
      lead_products: ["Schofield's", "Dispense"],
      tone_tier: "bartender_casual",
      opening_hours_summary: "Wed-Sun 5pm-midnight",
      price_tier: "mid-premium",
      ai_approval: "yes",
      ai_approval_reason: "Local sourcing ethos + new opening = high receptivity to new products",
      enrichment_source: "website",
      enrichment_status: "success",
      enrichment_error: null,
      contact: { name: "James", role: "Owner", confidence: "verified" },
    },
  });
  await seedMessage(leadH, 1, "sent", 2, {
    business_name: "The Fresh Bar",
    contact_name: "James",
    recipient_email: "james@freshbar.com",
  });
  console.log("  [H] The Fresh Bar — sent 2 days ago, too early for follow-up");

  // ──────────────────────────────────────────────
  console.log("\n--- Summary ---");
  console.log("8 leads seeded across leads, outreach_messages, inbound_replies");
  console.log("\nExpected generateFollowups behaviour:");
  console.log("  [A] The Cocktail Club    → skip (draft_exists — step 2 already approved)");
  console.log("  [B] Bar Valentino        → skip (draft_exists — step 3 already approved)");
  console.log("  [C] The Negroni Bar      → skip (draft_exists — step 4 already approved)");
  console.log("  [D] Closed Door Bar      → skip (not in eligible stages — no_response)");
  console.log("  [E] The Gin Palace       → skip (has_reply — responded stage)");
  console.log("  [F] Aperitivo House      → skip (has_reply — responded stage)");
  console.log("  [G] The Snoozed Lounge   → skip (snoozed)");
  console.log("  [H] The Fresh Bar        → skip (too_early — only 2 days)");
  console.log("\nTo test draft generation: approve & send the step 2/3/4 drafts for A/B/C,");
  console.log("then run generateFollowups again — it will generate the next step drafts.\n");
}

seed().then(() => process.exit(0)).catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
