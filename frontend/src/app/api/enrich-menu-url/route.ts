import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Targeted endpoint: find and write menu_url for leads that don't have one.
 * Checks homepage + /menu + /drinks sub-pages.
 * Does NOT re-run full Gemini enrichment.
 */

function extractMenuUrlFromHtml(html: string, baseUrl: string): string | null {
  const hrefRegex = /<a[^>]+href=["']([^"'#][^"']*?)["'][^>]*>/gi;
  const links: string[] = [];
  let m;
  while ((m = hrefRegex.exec(html)) !== null) {
    links.push(m[1]);
  }

  let base: URL;
  try { base = new URL(baseUrl); } catch { return null; }

  const absolute = links
    .map((l) => { try { return new URL(l, base).href; } catch { return null; } })
    .filter((l): l is string => !!l && l.startsWith("http"));

  const pdfMenu = absolute.find((l) =>
    /\.pdf$/i.test(l) && /menu|drink|wine|cocktail|food|beverage/i.test(l)
  );
  if (pdfMenu) return pdfMenu;

  const anyPdf = absolute.find((l) => /\.pdf$/i.test(l));
  if (anyPdf) return anyPdf;

  const menuPage = absolute.find((l) => {
    try {
      const path = new URL(l).pathname.toLowerCase();
      return /\/(menu|drinks|wine-?list|cocktails|food-drink)\b/.test(path);
    } catch { return false; }
  });
  if (menuPage) return menuPage;

  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AsterleyBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function findMenuUrl(websiteUrl: string): Promise<string | null> {
  const cleanUrl = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
  let base: URL;
  try { base = new URL(cleanUrl); } catch { return null; }
  const origin = base.origin;

  // Check homepage first
  const homepageHtml = await fetchHtml(cleanUrl);
  if (homepageHtml) {
    const found = extractMenuUrlFromHtml(homepageHtml, cleanUrl);
    if (found) return found;
  }

  // Check common menu sub-pages
  const subpages = ["/menu", "/drinks", "/food-drink", "/wine-list", "/cocktails"];
  for (const path of subpages) {
    const subUrl = `${origin}${path}`;
    const html = await fetchHtml(subUrl);
    if (html) {
      const found = extractMenuUrlFromHtml(html, subUrl);
      if (found) return found;
      // Also: if the sub-page itself is a menu page (PDF redirect etc.), use it
      // Check if the page loaded something relevant by checking response content
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = body?.limit || 30;
    const force = body?.force === true;

    const leadsSnap = await adminDb.collection("leads").get();
    const allLeads = leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const toProcess = allLeads.filter((lead: any) => {
      if (!lead.website) return false;
      if (force) return true;
      return !lead.menu_url;
    }).slice(0, limit);

    let found = 0;
    let notFound = 0;
    let failed = 0;

    for (const lead of toProcess) {
      try {
        const menuUrl = await findMenuUrl((lead as any).website);
        if (menuUrl) {
          await adminDb.collection("leads").doc(lead.id).update({ menu_url: menuUrl });
          console.log(`Menu URL found for ${(lead as any).business_name}: ${menuUrl}`);
          found++;
        } else {
          await adminDb.collection("leads").doc(lead.id).update({ menu_url: "not_found" });
          notFound++;
        }
      } catch (err: any) {
        console.error("Menu URL search failed for", (lead as any).business_name, err.message);
        failed++;
      }
    }

    return NextResponse.json({
      status: "completed",
      found,
      not_found: notFound,
      failed,
      total: toProcess.length,
    });
  } catch (err: any) {
    console.error("Enrich-menu-url error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
