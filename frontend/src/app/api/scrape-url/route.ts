import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.NEXT_PUBLIC_VPS_URL ?? "";

export async function POST(req: NextRequest) {
  if (!VPS) return NextResponse.json({ error: "VPS not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  if (!body.input || typeof body.input !== "string" || !body.input.trim()) {
    return NextResponse.json({ error: "Missing or empty 'input'" }, { status: 400 });
  }

  // Kicks off a background job on the VPS (fetch page → extract venues →
  // enrich each) and returns a batch_id immediately, so this stays under the
  // Netlify gateway timeout. Progress is polled via /api/scrape-batch/{id}.
  try {
    const vpsRes = await fetch(`${VPS}/api/scrape-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: body.input.trim() }),
    });
    const data = await vpsRes.json().catch(() => ({ error: "Invalid response from VPS" }));
    return NextResponse.json(data, { status: vpsRes.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
