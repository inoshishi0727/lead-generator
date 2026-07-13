import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.NEXT_PUBLIC_VPS_URL ?? "";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!VPS) return NextResponse.json({ error: "VPS not configured" }, { status: 503 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing lead id" }, { status: 400 });

  // Kicks off a background job on the VPS and returns a batch_id immediately,
  // so this proxy stays well under the Netlify gateway timeout. Progress is
  // polled via /api/scrape-batch/{batch_id}.
  try {
    const vpsRes = await fetch(`${VPS}/api/leads/${id}/scrape-now-async`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await vpsRes.json().catch(() => ({ error: "Invalid response from VPS" }));
    return NextResponse.json(data, { status: vpsRes.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
