import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { GoogleGenAI } from "@google/genai";

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_INPUT_CHARS = 12000;

const CATEGORY_PRODUCTS: Record<string, string[]> = {
  cocktail_bar: ["DISPENSE", "SCHOFIELD'S"],
  wine_bar: ["ESTATE", "ROSÉ", "ASTERLEY ORIGINAL"],
  italian_restaurant: ["DISPENSE", "ASTERLEY ORIGINAL", "ESTATE"],
  gastropub: ["DISPENSE", "ASTERLEY ORIGINAL"],
  hotel_bar: ["SCHOFIELD'S", "DISPENSE"],
  bottle_shop: ["DISPENSE", "SCHOFIELD'S", "ESTATE"],
  deli_farm_shop: ["ASTERLEY ORIGINAL", "ESTATE"],
  events_catering: ["ASTERLEY ORIGINAL", "DISPENSE"],
  rtd: ["DISPENSE", "ASTERLEY ORIGINAL"],
  restaurant_groups: ["DISPENSE", "SCHOFIELD'S"],
  festival_operators: ["ASTERLEY ORIGINAL", "DISPENSE"],
  cookery_schools: ["DISPENSE", "SCHOFIELD'S"],
  corporate_gifting: ["ASTERLEY ORIGINAL", "DISPENSE"],
  membership_clubs: ["DISPENSE", "SCHOFIELD'S", "ASTERLEY ORIGINAL"],
  airlines_trains: ["SCHOFIELD'S", "ASTERLEY ORIGINAL"],
  subscription_boxes: ["DISPENSE", "SCHOFIELD'S"],
  film_tv_theatre: ["DISPENSE", "ASTERLEY ORIGINAL"],
  yacht_charter: ["SCHOFIELD'S", "DISPENSE"],
  luxury_food_retail: ["SCHOFIELD'S", "ESTATE", "DISPENSE"],
  grocery: ["ASTERLEY ORIGINAL", "SCHOFIELD'S"],
};

const ANALYSIS_PROMPT = `You are an expert at analyzing hospitality venue websites for Asterley Bros, an independent English Vermouth, Amaro, and Aperitivo producer based in SE26, London.

Build a comprehensive business profile from this website. This profile will be used to:
1. Categorise the venue and decide which Asterley Bros products to pitch
2. Write a personalised outreach email from Rob (founder)
3. Score the lead's fit with the Asterley Bros range

Asterley Bros products: SCHOFIELD'S (English Dry Vermouth, for Martinis), ESTATE (English Sweet Vermouth, for Negronis), ROSÉ (Rosé Vermouth, for Spritzes), RED (value sweet vermouth), ASTERLEY ORIGINAL (British Aperitivo, Campari alternative, for Spritzes), DISPENSE (Modern British Amaro, 24 botanicals, for digestivos and Negronis), BRITANNICA (London Fernet).

Return a JSON object with ALL of these fields:

{
  "venue_category": one of ["cocktail_bar", "wine_bar", "italian_restaurant", "gastropub", "hotel_bar", "bottle_shop", "deli_farm_shop", "events_catering", "rtd", "restaurant_groups", "festival_operators", "cookery_schools", "corporate_gifting", "membership_clubs", "airlines_trains", "subscription_boxes", "film_tv_theatre", "yacht_charter", "luxury_food_retail", "grocery"],
  "business_summary": "MAX 20 words. What they are + what they do.",
  "location_area": "neighbourhood name only, e.g. 'Shoreditch' or 'Peckham' or null",
  "menu_fit": one of ["strong", "moderate", "weak", "unknown"],
  "menu_fit_signals": ["short bullet points of evidence"],
  "drinks_programme": "List actual drinks/cocktails from their menu. Semicolon-separated. null ONLY if zero drinks info on website. NEVER summarize in prose — list the actual items.",
  "why_asterley_fits": "MAX 20 words. Concrete reason.",
  "context_notes": "MAX 15 words. One specific hook for the email.",
  "tone_tier": one of ["bartender_casual", "warm_professional", "b2b_commercial", "corporate_formal"],
  "contact_name": "owner or manager name if found, or null",
  "contact_role": "their role or null",
  "contact_confidence": one of ["verified", "likely", "uncertain", null],
  "opening_hours_summary": "brief summary or null",
  "price_tier": one of ["budget", "mid_range", "premium", "luxury", null],
  "ai_approval": one of ["approve", "maybe", "reject"],
  "ai_approval_reason": "MAX 15 words. Why approve or reject."
}

CRITICAL RULES:
- ONLY state facts you can verify from the website content below. NEVER guess or assume.
- If the website doesn't mention drinks, cocktails, or a bar, say "No drinks programme visible on website" — do NOT invent one.
- If you can't determine something, use null.
- Every claim must be traceable to specific text from the website.

Business: {business_name}
Google Maps category: {google_category}
Address: {address}

Website content:
---
{website_text}
---

Return ONLY valid JSON. No markdown fencing, no backticks, no explanation.`;

function parseGeminiResponse(raw: string): Record<string, any> | null {
  if (!raw) return null;
  let cleaned = raw.trim();

  if (cleaned.startsWith("```")) {
    const firstNl = cleaned.indexOf("\n");
    const lastFence = cleaned.lastIndexOf("```");
    if (lastFence > firstNl) {
      cleaned = cleaned.slice(firstNl + 1, lastFence).trim();
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch {}

  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = start;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (depth === 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end)); } catch {}
  }
  return null;
}

async function fetchWebsiteText(url: string): Promise<string | null> {
  try {
    const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(cleanUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AsterleyBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Strip HTML tags, scripts, styles
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, MAX_INPUT_CHARS);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const limit = body?.limit || 50;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Get leads needing enrichment
    const leadsSnap = await adminDb.collection("leads").get();
    const allLeads = leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const needsEnrichment = allLeads.filter((lead: any) => {
      if (force) return !!lead.website;
      const e = lead.enrichment || {};
      const noEnrich = e.enrichment_status !== "success";
      const noDrinks = !e.drinks_programme || e.drinks_programme === "null";
      return (noEnrich || noDrinks) && !!lead.website;
    });

    const toProcess = needsEnrichment.slice(0, limit);
    let enriched = 0;
    let failed = 0;
    let skipped = 0;

    for (const lead of toProcess) {
      try {
        const websiteText = await fetchWebsiteText((lead as any).website);
        if (!websiteText) {
          console.log("No website content for", (lead as any).business_name);
          await adminDb.collection("leads").doc(lead.id).update({
            "enrichment.enrichment_status": "failed",
            "enrichment.enrichment_error": "Could not fetch website",
          });
          failed++;
          continue;
        }

        const prompt = ANALYSIS_PROMPT
          .replace("{business_name}", (lead as any).business_name || "")
          .replace("{google_category}", (lead as any).category || "unknown")
          .replace("{address}", (lead as any).address || "London")
          .replace("{website_text}", websiteText);

        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: { maxOutputTokens: 4000, temperature: 0.2 },
        });

        const parsed = parseGeminiResponse(response.text || "");
        if (!parsed) {
          console.error("Parse failed for", (lead as any).business_name);
          await adminDb.collection("leads").doc(lead.id).update({
            "enrichment.enrichment_status": "failed",
            "enrichment.enrichment_error": "Failed to parse Gemini response",
          });
          failed++;
          continue;
        }

        // Deterministic product mapping
        const venueCat = parsed.venue_category || "cocktail_bar";
        const leadProducts = CATEGORY_PRODUCTS[venueCat] || [];

        const enrichment: Record<string, any> = {
          venue_category: venueCat,
          business_summary: parsed.business_summary || null,
          location_area: parsed.location_area || null,
          menu_fit: parsed.menu_fit || "unknown",
          menu_fit_signals: parsed.menu_fit_signals || [],
          drinks_programme: parsed.drinks_programme || null,
          why_asterley_fits: parsed.why_asterley_fits || null,
          context_notes: parsed.context_notes || null,
          lead_products: leadProducts,
          tone_tier: parsed.tone_tier || "bartender_casual",
          opening_hours_summary: parsed.opening_hours_summary || null,
          price_tier: parsed.price_tier || null,
          ai_approval: parsed.ai_approval || null,
          ai_approval_reason: parsed.ai_approval_reason || null,
          enrichment_source: "website",
          enrichment_status: "success",
          enrichment_error: null,
        };

        if (parsed.contact_name) {
          enrichment.contact = {
            name: parsed.contact_name,
            role: parsed.contact_role || null,
            confidence: parsed.contact_confidence || "uncertain",
          };
        }

        await adminDb.collection("leads").doc(lead.id).update({ enrichment });
        enriched++;
        console.log("Enriched:", (lead as any).business_name, "->", venueCat);
      } catch (err: any) {
        console.error("Enrich failed for", (lead as any).business_name, err.message);
        failed++;
      }
    }

    skipped = allLeads.length - toProcess.length - enriched - failed;

    return NextResponse.json({
      status: "completed",
      enriched,
      failed,
      skipped: Math.max(0, skipped),
      total: toProcess.length,
    });
  } catch (err: any) {
    console.error("Enrich endpoint error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
