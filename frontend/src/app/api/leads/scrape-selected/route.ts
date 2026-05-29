import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.NEXT_PUBLIC_VPS_URL ?? "";

export async function POST(req: NextRequest) {
  if (!VPS) return NextResponse.json({ error: "VPS not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.lead_ids) || body.lead_ids.length === 0) {
    return NextResponse.json({ error: "Missing 'lead_ids' array" }, { status: 400 });
  }

  try {
    const vpsRes = await fetch(`${VPS}/api/leads/scrape-selected`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_ids: body.lead_ids }),
    });
    const data = await vpsRes.json().catch(() => ({ error: "Invalid response from VPS" }));
    return NextResponse.json(data, { status: vpsRes.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
