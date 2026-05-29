import { NextRequest, NextResponse } from "next/server";

const VPS = process.env.NEXT_PUBLIC_VPS_URL ?? "";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!VPS) return NextResponse.json({ error: "VPS not configured" }, { status: 503 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing lead id" }, { status: 400 });

  // Single-lead scrape + enrich is synchronous on the VPS (45–120s).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180_000);

  try {
    const vpsRes = await fetch(`${VPS}/api/leads/${id}/scrape-now`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
