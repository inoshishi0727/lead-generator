import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.NEXT_PUBLIC_VPS_URL ?? "";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!VPS) return NextResponse.json({ error: "VPS not configured" }, { status: 503 });
  const { runId } = await params;
  if (!runId) return NextResponse.json({ error: "Missing runId" }, { status: 400 });

  try {
    const vpsRes = await fetch(`${VPS}/api/enrich-status/${runId}`);
    const data = await vpsRes.json().catch(() => ({ error: "Invalid response from VPS" }));
    return NextResponse.json(data, { status: vpsRes.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
