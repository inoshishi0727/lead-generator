import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.NEXT_PUBLIC_VPS_URL ?? "";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  if (!VPS) return NextResponse.json({ error: "VPS not configured" }, { status: 503 });
  const { batchId } = await params;
  if (!batchId) return NextResponse.json({ error: "Missing batchId" }, { status: 400 });

  try {
    const vpsRes = await fetch(`${VPS}/api/scrape-batch/${batchId}`);
    const data = await vpsRes.json().catch(() => ({ error: "Invalid response from VPS" }));
    return NextResponse.json(data, { status: vpsRes.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
