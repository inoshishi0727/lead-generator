import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.NEXT_PUBLIC_VPS_URL ?? "";

export async function POST(req: NextRequest) {
  if (!VPS) return NextResponse.json({ error: "VPS not configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const vpsRes = await fetch(`${VPS}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await vpsRes.json();
  return NextResponse.json(data, { status: vpsRes.status });
}
