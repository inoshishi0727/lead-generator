import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.NEXT_PUBLIC_VPS_URL ?? "";

export async function GET(req: NextRequest) {
  if (!VPS) return NextResponse.json({ error: "VPS not configured" }, { status: 503 });
  const runId = req.nextUrl.searchParams.get("run_id");
  if (!runId) return NextResponse.json({ error: "Missing run_id" }, { status: 400 });
  const vpsRes = await fetch(`${VPS}/api/scrape-status/${runId}`);
  const data = await vpsRes.json();
  return NextResponse.json(data, { status: vpsRes.status });
}
