import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const PRICING = {
  claude: {
    model: "Claude Sonnet 4",
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
  },
  gemini: {
    model: "Gemini 2.5 Flash",
    inputPerMTok: 0.15,
    outputPerMTok: 3.5,
  },
};

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return null;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function rowCost(provider: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[provider as keyof typeof PRICING];
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.inputPerMTok + (outputTokens / 1_000_000) * p.outputPerMTok;
}

type Window = 7 | 30 | 90 | "all";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all") === "1" || searchParams.get("days") === "all";
    const days = all ? 0 : Math.max(1, Math.min(365, parseInt(searchParams.get("days") || "30", 10)));

    let since: Date | null = null;
    if (!all) {
      since = new Date();
      since.setUTCDate(since.getUTCDate() - days);
      since.setUTCHours(0, 0, 0, 0);
    }

    const base = adminDb.collection("outreach_messages");
    const snap = await base.get();

    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;
    let totalDrafts = 0;
    const byProvider = new Map<string, { drafts: number; inputTokens: number; outputTokens: number; cost: number }>();
    const byDay = new Map<string, {
      date: string;
      drafts: number;
      inputTokens: number;
      outputTokens: number;
      cost: number;
    }>();

    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.status !== "draft" && d.status !== "sent" && d.status !== "approved" && d.status !== "rejected") continue;

      const created = tsToDate(d.created_at);
      if (!created) continue;
      if (since && created < since) continue;

      const provider = d.provider || "claude";
      const content = d.content || "";
      const subject = d.subject || "";
      const systemPromptEstimate = 2000;

      const inputTokens = estimateTokens(subject + content) + systemPromptEstimate;
      const outputTokens = estimateTokens(content);
      const cost = rowCost(provider, inputTokens, outputTokens);

      totalInput += inputTokens;
      totalOutput += outputTokens;
      totalCost += cost;
      totalDrafts += 1;

      const provEntry = byProvider.get(provider) ?? { drafts: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
      provEntry.drafts += 1;
      provEntry.inputTokens += inputTokens;
      provEntry.outputTokens += outputTokens;
      provEntry.cost += cost;
      byProvider.set(provider, provEntry);

      const key = dayKey(created);
      const existing = byDay.get(key) ?? { date: key, drafts: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
      existing.drafts += 1;
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.cost += cost;
      byDay.set(key, existing);
    }

    const daily = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
    const avgCostPerDraft = totalDrafts > 0 ? totalCost / totalDrafts : 0;

    return NextResponse.json({
      windowDays: all ? null : days,
      all,
      since: since ? since.toISOString() : null,
      pricing: PRICING,
      totals: {
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cost: totalCost,
        drafts: totalDrafts,
        avgCostPerDraft,
        byProvider: Object.fromEntries(byProvider),
      },
      daily,
    });
  } catch (err) {
    console.error("Draft cost analytics error:", err);
    return NextResponse.json({ error: "Draft cost analytics failed" }, { status: 500 });
  }
}
