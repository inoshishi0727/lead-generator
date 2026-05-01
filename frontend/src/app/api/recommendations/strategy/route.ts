import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { GoogleGenAI } from "@google/genai";
import type { StrategyResponse, EditPatternStat } from "@/lib/types";

export async function GET(): Promise<NextResponse> {
  let rawData: Partial<StrategyResponse> = {};
  try {
    const [msgSnap, feedbackSnap, repliesSnap] = await Promise.all([
      adminDb.collection("outreach_messages").get(),
      adminDb.collection("edit_feedback").get(),
      adminDb.collection("inbound_replies").get(),
    ]);

    const msgs = msgSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Record<string, any>[];
    const feedbacks = feedbackSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Record<string, any>[];
    const replies = repliesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Record<string, any>[];

    const sent = msgs.filter((m) => m.status === "sent");
    const totalSent = sent.length;

    // --- Edit feedback patterns ---
    const editCats: Record<string, { count: number; notes: string[] }> = {};
    for (const f of feedbacks) {
      const cat = f.reflection_category || "other";
      if (!editCats[cat]) editCats[cat] = { count: 0, notes: [] };
      editCats[cat].count++;
      if (f.reflection_note) editCats[cat].notes.push(f.reflection_note);
    }
    const totalEdits = feedbacks.length;
    const editPatterns: EditPatternStat[] = Object.entries(editCats)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([cat, s]) => ({
        category: cat,
        count: s.count,
        pct: totalEdits > 0 ? Math.round((s.count / totalEdits) * 100) : 0,
        example_note: s.notes[0] ?? null,
      }));

    // --- Content ratings from messages ---
    const ratedMsgs = msgs.filter((m) => m.content_rating);
    const greatMsgs = ratedMsgs.filter((m) => m.content_rating === "great");
    const goodMsgs = ratedMsgs.filter((m) => m.content_rating === "good");
    const notInterested = ratedMsgs.filter((m) => m.content_rating === "not_interested");
    const greatSubjects = greatMsgs
      .map((m) => m.subject)
      .filter(Boolean)
      .slice(0, 5) as string[];
    const contentSignals = {
      great: greatMsgs.length,
      good: goodMsgs.length,
      not_interested: notInterested.length,
      great_subjects: greatSubjects,
    };

    // --- Reply sentiment ---
    const inbound = replies.filter((r) => r.direction === "inbound" || !r.direction);
    const sentimentCount = { positive: 0, negative: 0, neutral: 0 };
    for (const r of inbound) {
      if (r.sentiment === "positive") sentimentCount.positive++;
      else if (r.sentiment === "negative") sentimentCount.negative++;
      else if (r.sentiment === "neutral") sentimentCount.neutral++;
    }

    // --- Outreach performance aggregates ---
    const byCat: Record<string, { sent: number; replied: number; opened: number }> = {};
    for (const m of sent) {
      const cat = m.venue_category || "other";
      if (!byCat[cat]) byCat[cat] = { sent: 0, replied: 0, opened: 0 };
      byCat[cat].sent++;
      if (m.has_reply) byCat[cat].replied++;
      if (m.opened) byCat[cat].opened++;
    }

    const byStep: Record<number, { sent: number; replied: number }> = {};
    for (const m of sent) {
      const step = m.step_number ?? 1;
      if (!byStep[step]) byStep[step] = { sent: 0, replied: 0 };
      byStep[step].sent++;
      if (m.has_reply) byStep[step].replied++;
    }

    const subjectMap: Record<string, { sent: number; replied: number; opened: number }> = {};
    for (const m of sent) {
      if (!m.subject) continue;
      if (!subjectMap[m.subject]) subjectMap[m.subject] = { sent: 0, replied: 0, opened: 0 };
      subjectMap[m.subject].sent++;
      if (m.has_reply) subjectMap[m.subject].replied++;
      if (m.opened) subjectMap[m.subject].opened++;
    }
    const topSubjects = Object.entries(subjectMap)
      .filter(([, s]) => s.sent >= 3)
      .sort(([, a], [, b]) => (b.replied / b.sent) - (a.replied / a.sent))
      .slice(0, 5)
      .map(([subject, s]) => ({
        subject,
        reply_rate: ((s.replied / s.sent) * 100).toFixed(1),
        open_rate: ((s.opened / s.sent) * 100).toFixed(1),
        sent: s.sent,
      }));

    const catStats = Object.entries(byCat)
      .sort(([, a], [, b]) => b.sent - a.sent)
      .map(([cat, s]) => ({
        category: cat.replace(/_/g, " "),
        sent: s.sent,
        reply_rate: s.sent > 0 ? ((s.replied / s.sent) * 100).toFixed(1) : "0.0",
        open_rate: s.sent > 0 ? ((s.opened / s.sent) * 100).toFixed(1) : "0.0",
      }));

    const stepStats = Object.entries(byStep)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([step, s]) => ({
        step: Number(step),
        sent: s.sent,
        reply_rate: s.sent > 0 ? ((s.replied / s.sent) * 100).toFixed(1) : "0.0",
      }));

    const overallReplyRate = totalSent > 0
      ? ((sent.filter((m) => m.has_reply).length / totalSent) * 100).toFixed(1)
      : "0.0";
    const overallOpenRate = totalSent > 0
      ? ((sent.filter((m) => m.opened).length / totalSent) * 100).toFixed(1)
      : "0.0";

    rawData = {
      total_sent: totalSent,
      overall_reply_rate: overallReplyRate,
      overall_open_rate: overallOpenRate,
      edit_patterns: editPatterns,
      content_signals: contentSignals,
      reply_sentiment: sentimentCount,
    };

    if (totalSent < 5) {
      return NextResponse.json<StrategyResponse>({
        insights: [],
        ratio_adjustments: [],
        query_suggestions: [],
        generated_at: new Date().toISOString(),
        ...rawData,
      });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json<StrategyResponse>({
        insights: [],
        ratio_adjustments: [],
        query_suggestions: [],
        generated_at: new Date().toISOString(),
        ...rawData,
      });
    }

    const editSummary = editPatterns.length > 0
      ? editPatterns.map((e) =>
          `  ${e.category}: ${e.count} edits (${e.pct}%)${e.example_note ? ` — e.g. "${e.example_note}"` : ""}`
        ).join("\n")
      : "  No edit feedback recorded yet";

    const ratingsSummary = `  Great: ${contentSignals.great}, Good: ${contentSignals.good}, Not interested: ${contentSignals.not_interested}${
      greatSubjects.length > 0 ? `\n  Top-rated subjects: ${greatSubjects.slice(0, 3).map((s) => `"${s}"`).join(", ")}` : ""
    }`;

    const sentimentSummary = `  Positive: ${sentimentCount.positive}, Negative: ${sentimentCount.negative}, Neutral: ${sentimentCount.neutral}`;

    const prompt = `You are the sales strategist for Asterley Bros (English Vermouth, Amaro & Aperitivo, SE London).
Analyse ALL of these outreach performance signals and return actionable recommendations as JSON.

OUTREACH STATS:
- Total sent: ${totalSent}
- Overall reply rate: ${overallReplyRate}%
- Overall open rate: ${overallOpenRate}%

By venue category:
${catStats.map((c) => `  ${c.category}: ${c.sent} sent, ${c.reply_rate}% reply, ${c.open_rate}% open`).join("\n")}

By follow-up step:
${stepStats.map((s) => `  Step ${s.step}: ${s.sent} sent, ${s.reply_rate}% reply`).join("\n")}

Top subject lines (by reply rate, min 3 sent):
${topSubjects.map((s, i) => `  ${i + 1}. "${s.subject}" — ${s.reply_rate}% reply, ${s.open_rate}% open (${s.sent} sent)`).join("\n") || "  Not enough data"}

HUMAN EDIT FEEDBACK (${totalEdits} total edits — what humans changed in AI drafts):
${editSummary}

CONTENT QUALITY RATINGS (human-rated messages):
${ratingsSummary}

REPLY SENTIMENT:
${sentimentSummary}

Return ONLY valid JSON matching this exact TypeScript type (no markdown, no explanation):
{
  "insights": [
    {
      "title": string,
      "description": string,
      "action": string,
      "priority": "high" | "medium" | "low",
      "category": string | null
    }
  ],
  "ratio_adjustments": [
    {
      "category": string,
      "current_ratio": number,
      "recommended_ratio": number,
      "reason": string
    }
  ],
  "query_suggestions": string[]
}

Rules:
- 3-6 insights maximum, most important first
- Insights MUST draw from edit feedback patterns AND content ratings, not just send/reply stats
- If certain edit categories dominate (e.g. "tone" 40%), flag that as an insight with specific fix
- If content ratings skew negative, diagnose why based on the data
- ratio_adjustments: only for categories with 5+ sent; ratios as 0-100, sum ~100
- query_suggestions: 2-4 new search query ideas based on best-performing venue categories
- Be specific and data-driven — reference the actual numbers`;

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const raw = (response.text ?? "").trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON in Gemini response");
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));

    return NextResponse.json<StrategyResponse>({
      ...parsed,
      generated_at: new Date().toISOString(),
      ...rawData,
    });
  } catch (err: any) {
    console.error("Strategy recommendations failed:", err.message);
    return NextResponse.json<StrategyResponse>({
      insights: [],
      ratio_adjustments: [],
      query_suggestions: [],
      generated_at: null,
      ...rawData,
    });
  }
}
