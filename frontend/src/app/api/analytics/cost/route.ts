import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const HAIKU_PRICING = {
  inputPerMTok: 1.0,
  outputPerMTok: 5.0,
  cacheWritePerMTok: 1.25,
  cacheReadPerMTok: 0.1,
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

function rowCost(r: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}): number {
  return (
    (r.inputTokens / 1_000_000) * HAIKU_PRICING.inputPerMTok +
    (r.outputTokens / 1_000_000) * HAIKU_PRICING.outputPerMTok +
    (r.cacheCreationTokens / 1_000_000) * HAIKU_PRICING.cacheWritePerMTok +
    (r.cacheReadTokens / 1_000_000) * HAIKU_PRICING.cacheReadPerMTok
  );
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get("all") === "1" || searchParams.get("days") === "all";
    const days = all ? 0 : Math.max(1, Math.min(365, parseInt(searchParams.get("days") || "30", 10)));
    // Admin opt-in: ?includeTest=1 to fold internal QA sessions back in.
    const includeTest = searchParams.get("includeTest") === "1";

    let since: Date | null = null;
    if (!all) {
      since = new Date();
      since.setUTCDate(since.getUTCDate() - days);
      since.setUTCHours(0, 0, 0, 0);
    }

    // Pre-load the set of session IDs we want to treat as internal. The
    // backfill script tags `isTest:true` on both the conversation doc and
    // any matching `sommelier_usage` rows, but until that's been run we
    // need to derive the exclusion set from the conversations collection.
    const internalSessionIds = new Set<string>();
    if (!includeTest) {
      const convSnap = await adminDb.collection("sommelier_conversations").get();
      for (const cdoc of convSnap.docs) {
        const c = cdoc.data();
        if (c.isTest === true) internalSessionIds.add(cdoc.id);
        else if (Array.isArray(c.tags) && c.tags.includes("internal")) internalSessionIds.add(cdoc.id);
      }
    }

    const base = adminDb.collection("sommelier_usage");
    const snap = await base.get();
    let excludedTestRows = 0;

    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheWrite = 0;
    let totalCacheRead = 0;
    let totalCost = 0;
    let totalCalls = 0;
    const sessions = new Set<string>();
    const byDay = new Map<string, {
      date: string;
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      cost: number;
      calls: number;
    }>();
    const sessionCost = new Map<string, number>();

    for (const doc of snap.docs) {
      const d = doc.data();
      const created = tsToDate(d.createdAt);
      if (!created) continue;
      if (since && created < since) continue;

      // Skip internal QA traffic unless explicitly requested. Caught by
      // either the per-row `isTest` flag OR the conversation-derived set
      // above (in case the backfill hasn't tagged usage docs yet).
      if (!includeTest && (d.isTest === true || (d.sessionId && internalSessionIds.has(d.sessionId)))) {
        excludedTestRows++;
        continue;
      }

      const r = {
        inputTokens: d.inputTokens ?? 0,
        outputTokens: d.outputTokens ?? 0,
        cacheCreationTokens: d.cacheCreationTokens ?? 0,
        cacheReadTokens: d.cacheReadTokens ?? 0,
      };
      const cost = rowCost(r);

      totalInput += r.inputTokens;
      totalOutput += r.outputTokens;
      totalCacheWrite += r.cacheCreationTokens;
      totalCacheRead += r.cacheReadTokens;
      totalCost += cost;
      totalCalls += 1;
      if (d.sessionId) {
        sessions.add(d.sessionId);
        sessionCost.set(d.sessionId, (sessionCost.get(d.sessionId) ?? 0) + cost);
      }

      const key = dayKey(created);
      const existing = byDay.get(key) ?? {
        date: key,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        calls: 0,
      };
      existing.inputTokens += r.inputTokens;
      existing.outputTokens += r.outputTokens;
      existing.cacheCreationTokens += r.cacheCreationTokens;
      existing.cacheReadTokens += r.cacheReadTokens;
      existing.cost += cost;
      existing.calls += 1;
      byDay.set(key, existing);
    }

    const daily = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
    const sessionCount = sessions.size;
    const avgCostPerSession = sessionCount > 0 ? totalCost / sessionCount : 0;

    return NextResponse.json({
      windowDays: all ? null : days,
      all,
      since: since ? since.toISOString() : null,
      pricing: HAIKU_PRICING,
      // How many usage rows were folded out as internal/test traffic. Lets
      // the Dashboard show "N test sessions hidden" without a second query.
      excludedTestRows,
      totals: {
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheCreationTokens: totalCacheWrite,
        cacheReadTokens: totalCacheRead,
        cost: totalCost,
        calls: totalCalls,
        sessions: sessionCount,
        avgCostPerSession,
      },
      daily,
    });
  } catch (err) {
    console.error("Cost analytics error:", err);
    return NextResponse.json({ error: "Cost analytics failed" }, { status: 500 });
  }
}
