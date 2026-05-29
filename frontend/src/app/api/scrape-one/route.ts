import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.NEXT_PUBLIC_VPS_URL ?? "";

export async function POST(req: NextRequest) {
  if (!VPS) return NextResponse.json({ error: "VPS not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  if (!body.input || typeof body.input !== "string" || !body.input.trim()) {
    return NextResponse.json({ error: "Missing or empty 'input'" }, { status: 400 });
  }

  // Single-venue scrape + enrich is synchronous on the VPS and can take
  // 45-120s end-to-end (scrape 15-45s, then enrichment 30-75s). Give the
  // fetch a generous timeout to avoid premature aborts mid-enrichment.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180_000);

  try {
    const vpsRes = await fetch(`${VPS}/api/scrape-one`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: body.input.trim() }),
      signal: ctrl.signal,
    });
    const data = await vpsRes.json().catch(() => ({ error: "Invalid response from VPS" }));
    return NextResponse.json(data, { status: vpsRes.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const aborted = msg.toLowerCase().includes("abort");
    return NextResponse.json(
      { error: aborted ? "Scrape timed out after 180s" : msg },
      { status: 504 },
    );
  } finally {
    clearTimeout(timer);
  }
}
