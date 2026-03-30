import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { GoogleGenAI } from "@google/genai";

const SEASONS: Record<string, { months: number[]; products: string[]; hook: string; serves: string }> = {
  spring_summer: { months: [3,4,5,6], products: ["Asterley Original","Schofield's","Rosé","Dispense"], hook: "Spring/Summer menus", serves: "Spritzes, White Negronis, highballs" },
  high_summer: { months: [7,8], products: ["Asterley Original","Rosé","Red"], hook: "terrace season", serves: "Spritzes, long drinks, pre-batched Negronis" },
  autumn_winter: { months: [9,10,11,12,2], products: ["Estate","Dispense","Britannica","Asterley Original"], hook: "Autumn/Winter menus", serves: "Negronis, Manhattans, digestivos" },
  january: { months: [1], products: ["Schofield's","Estate","Dispense"], hook: "Dry January / low ABV", serves: "Reverse Martini, Americano, low ABV Spritzes" },
};

const SEASONAL_CAT_PRIORITY: Record<string, Record<string, number>> = {
  spring_summer: { cocktail_bar:10, wine_bar:9, hotel_bar:8, italian_restaurant:8, bottle_shop:7, gastropub:6, restaurant_groups:5 },
  high_summer: { gastropub:10, hotel_bar:9, cocktail_bar:8, wine_bar:7 },
  autumn_winter: { cocktail_bar:10, hotel_bar:9, italian_restaurant:9, wine_bar:8, restaurant_groups:7 },
  january: { wine_bar:10, cocktail_bar:9, hotel_bar:8, gastropub:7, bottle_shop:6 },
};

function getSeason(): string {
  const m = new Date().getMonth() + 1;
  for (const [name, cfg] of Object.entries(SEASONS)) {
    if (cfg.months.includes(m)) return name;
  }
  return "spring_summer";
}

function getSendWindow() {
  const now = new Date();
  const wd = now.getDay();
  const BEST = [2,3,4];
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

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") || "10");

    const leadsSnap = await adminDb.collection("leads").get();
    const docs = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Record<string, any>[];

    const season = getSeason();
    const seasonCfg = SEASONS[season];
    const catPriority = SEASONAL_CAT_PRIORITY[season] || {};
    const sendWindow = getSendWindow();

    if (!docs.length) {
      return NextResponse.json({ season, seasonal_hook: seasonCfg.hook, seasonal_products: seasonCfg.products, seasonal_serves: seasonCfg.serves, send_window: sendWindow, ai_summary: null, recommended: [], total_eligible: 0, weekly_target: 100, weekly_progress: { total: 0, remaining: 100, by_category: {} }, scrape_recommendations: [], generated_at: new Date().toISOString() });
    }

    const scoredLeads: any[] = [];
    const categoryCounts: Record<string, number> = {};

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
      const reasons: string[] = [];

      if (lead.email) priority += 15;

      const catScore = catPriority[venueCat] || 2;
      priority += catScore * 3;
      if (catScore >= 8) reasons.push(`${venueCat.replace(/_/g," ")} is high-priority for ${seasonCfg.hook}`);

      if (menuFit === "strong") { priority += 20; reasons.push("Strong menu fit"); }
      else if (menuFit === "moderate") { priority += 10; }

      if (e.enrichment_status === "success") { priority += 10; if (e.why_asterley_fits) reasons.push(e.why_asterley_fits); }

      const seasonalProducts = new Set(seasonCfg.products);
      const overlap = leadProducts.filter((p: string) => seasonalProducts.has(p));
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

    // AI weekly summary
    let aiSummary: string | null = null;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && topLeads.length > 0) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const catBreakdown = Object.entries(categoryCounts)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .map(([cat, count]) => `${cat.replace(/_/g, " ")}: ${count}`)
          .join(", ");

        const topLeadSummary = topLeads.slice(0, 5).map((l: any) =>
          `${l.business_name} (${l.venue_category.replace(/_/g, " ")}${l.menu_fit !== "unknown" ? `, ${l.menu_fit} fit` : ""})`
        ).join("; ");

        const prompt = `You are the sales strategist for Asterley Bros (English Vermouth, Amaro & Aperitivo, SE London).

Season: ${season.replace(/_/g, " ")}
Seasonal hook: ${seasonCfg.hook}
Seasonal products: ${seasonCfg.products.join(", ")}
Best serves right now: ${seasonCfg.serves}
Total active leads: ${scoredLeads.length}
With email: ${scoredLeads.filter((l: any) => l.email).length}
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
      } catch (err: any) {
        console.error("AI summary failed:", err.message);
      }
    }

    return NextResponse.json({
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
      scrape_recommendations: [],
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Outreach plan error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
