/**
 * Client-side analytics computed directly from Firestore data.
 * No backend needed.
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type {
  FunnelData,
  FunnelStage,
  CategoryStat,
  RatioComparison,
  TrendPoint,
  SubjectLineStat,
  ReplyRateTrendPoint,
  ReplyRateByDimensionPoint,
  OpenRateTrendPoint,
} from "./types";

const STAGE_ORDER = [
  "scraped", "needs_email", "enriched", "scored",
  "draft_generated", "approved", "sent",
  "follow_up_1", "follow_up_2", "responded", "converted", "declined",
];

const TARGET_RATIOS: Record<string, number> = {
  cocktail_bar: 0.20,
  wine_bar: 0.15,
  hotel_bar: 0.10,
  italian_restaurant: 0.10,
  gastropub: 0.10,
  bottle_shop: 0.10,
  restaurant_groups: 0.05,
  other: 0.20,
};

async function getAllLeads(): Promise<any[]> {
  const snap = await getDocs(collection(db, "leads"));
  return snap.docs.map((d) => d.data());
}

export async function getFunnel(): Promise<FunnelData> {
  const docs = await getAllLeads();
  if (!docs.length) return { stages: [], total_leads: 0 };

  const counts: Record<string, number> = {};
  for (const doc of docs) {
    const stage = doc.stage || "scraped";
    counts[stage] = (counts[stage] || 0) + 1;
  }

  const total = docs.length;
  const stages: FunnelStage[] = STAGE_ORDER.map((name) => ({
    name,
    count: counts[name] || 0,
    conversion_rate: total > 0 ? Math.round(((counts[name] || 0) / total) * 1000) / 10 : 0,
  }));

  return { stages, total_leads: total };
}

export async function getCategories(): Promise<{ categories: CategoryStat[] }> {
  const docs = await getAllLeads();
  if (!docs.length) return { categories: [] };

  const byCategory: Record<string, any[]> = {};
  for (const doc of docs) {
    const e = doc.enrichment || {};
    const cat = e.venue_category || "other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(doc);
  }

  const categories: CategoryStat[] = Object.entries(byCategory)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([cat, catDocs]) => {
      const scores = catDocs.filter((d) => d.score != null).map((d) => d.score);
      const avgScore = scores.length ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10 : 0;
      const sent = catDocs.filter((d) => ["sent", "follow_up_1", "follow_up_2", "responded", "converted", "declined"].includes(d.stage)).length;
      const responded = catDocs.filter((d) => ["responded", "converted"].includes(d.stage)).length;
      const converted = catDocs.filter((d) => d.stage === "converted").length;

      return {
        category: cat,
        count: catDocs.length,
        avg_score: avgScore,
        response_rate: sent > 0 ? Math.round((responded / sent) * 1000) / 10 : 0,
        conversion_rate: catDocs.length > 0 ? Math.round((converted / catDocs.length) * 1000) / 10 : 0,
      };
    });

  return { categories };
}

export async function getRatios(): Promise<{ ratios: RatioComparison[] }> {
  const docs = await getAllLeads();
  const total = docs.length || 1;

  const catCounts: Record<string, number> = {};
  for (const doc of docs) {
    const e = doc.enrichment || {};
    const cat = e.venue_category || "other";
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }

  const ratios: RatioComparison[] = Object.entries(TARGET_RATIOS).map(([cat, target]) => {
    const actual = (catCounts[cat] || 0) / total;
    return {
      category: cat,
      target: Math.round(target * 10000) / 10000,
      actual: Math.round(actual * 10000) / 10000,
      delta: Math.round((target - actual) * 10000) / 10000,
    };
  });

  ratios.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { ratios };
}

export async function getTrends(period: string = "week", lookback: number = 12): Promise<{ series: TrendPoint[] }> {
  const docs = await getAllLeads();
  if (!docs.length) return { series: [] };

  const now = new Date();
  const deltaMs = period === "week" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;

  const buckets: Record<string, Record<string, number>> = {};
  const bucketKeys: string[] = [];

  for (let i = 0; i < lookback; i++) {
    const bucketStart = new Date(now.getTime() - deltaMs * (lookback - i));
    const key = bucketStart.toISOString().split("T")[0];
    bucketKeys.push(key);
    buckets[key] = { scraped: 0, enriched: 0, scored: 0, sent: 0, converted: 0 };
  }

  for (const doc of docs) {
    const scrapedAt = doc.scraped_at;
    if (!scrapedAt) continue;

    const scrapedDate = typeof scrapedAt === "string" ? scrapedAt.split("T")[0] : "";
    let assigned: string | null = null;

    for (const bk of bucketKeys) {
      if (scrapedDate >= bk) assigned = bk;
    }

    if (assigned && buckets[assigned]) {
      const stage = doc.stage || "scraped";
      buckets[assigned].scraped++;
      if (["enriched", "scored", "draft_generated", "approved", "sent", "follow_up_1", "follow_up_2", "responded", "converted"].includes(stage)) {
        buckets[assigned].enriched++;
      }
      if (["scored", "draft_generated", "approved", "sent", "follow_up_1", "follow_up_2", "responded", "converted"].includes(stage)) {
        buckets[assigned].scored++;
      }
      if (["sent", "follow_up_1", "follow_up_2", "responded", "converted"].includes(stage)) {
        buckets[assigned].sent++;
      }
      if (stage === "converted") {
        buckets[assigned].converted++;
      }
    }
  }

  const series: TrendPoint[] = bucketKeys.map((key) => ({
    period: key,
    scraped: buckets[key].scraped,
    enriched: buckets[key].enriched,
    scored: buckets[key].scored,
    sent: buckets[key].sent,
    converted: buckets[key].converted,
  }));

  return { series };
}

async function getAllSentOutreachMessages(): Promise<any[]> {
  const snap = await getDocs(
    query(collection(db, "outreach_messages"), where("status", "==", "sent"))
  );
  return snap.docs.map((d) => d.data());
}

export async function getReplyRateTrend(lookback: number = 12): Promise<{ series: ReplyRateTrendPoint[] }> {
  const msgs = await getAllSentOutreachMessages();
  if (!msgs.length) return { series: [] };

  const now = new Date();
  // Roll back to most recent Monday
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = (dayOfWeek + 6) % 7;
  const thisMondayMs = now.getTime() - mondayOffset * 24 * 60 * 60 * 1000;
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<string, { sent: number; replied: number }> = {};
  const bucketKeys: string[] = [];

  for (let i = 0; i < lookback; i++) {
    const bucketStart = new Date(thisMondayMs - (lookback - 1 - i) * weekMs);
    const key = bucketStart.toISOString().split("T")[0];
    bucketKeys.push(key);
    buckets[key] = { sent: 0, replied: 0 };
  }

  for (const msg of msgs) {
    const sentAt = msg.sent_at;
    if (!sentAt) continue;
    const dateStr = typeof sentAt === "string" ? sentAt.split("T")[0] : "";
    if (!dateStr || isNaN(Date.parse(dateStr))) continue;

    let assigned: string | null = null;
    for (const bk of bucketKeys) {
      if (dateStr >= bk) assigned = bk;
    }

    if (assigned && buckets[assigned]) {
      buckets[assigned].sent++;
      if (msg.has_reply || (msg.reply_count && msg.reply_count > 0)) {
        buckets[assigned].replied++;
      }
    }
  }

  const series: ReplyRateTrendPoint[] = bucketKeys.map((week) => ({
    week,
    sent: buckets[week].sent,
    replied: buckets[week].replied,
    reply_rate:
      buckets[week].sent > 0
        ? Math.round((buckets[week].replied / buckets[week].sent) * 1000) / 10
        : 0,
  }));

  return { series };
}

export async function getOpenRateTrend(lookback: number = 12): Promise<{ series: OpenRateTrendPoint[] }> {
  const msgs = await getAllSentOutreachMessages();
  if (!msgs.length) return { series: [] };

  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const thisMondayMs = now.getTime() - mondayOffset * 24 * 60 * 60 * 1000;
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<string, { sent: number; delivered: number; opened: number; replied: number }> = {};
  const bucketKeys: string[] = [];

  for (let i = 0; i < lookback; i++) {
    const bucketStart = new Date(thisMondayMs - (lookback - 1 - i) * weekMs);
    const key = bucketStart.toISOString().split("T")[0];
    bucketKeys.push(key);
    buckets[key] = { sent: 0, delivered: 0, opened: 0, replied: 0 };
  }

  for (const msg of msgs) {
    const sentAt = msg.sent_at;
    if (!sentAt) continue;
    const dateStr = typeof sentAt === "string" ? sentAt.split("T")[0] : "";
    if (!dateStr || isNaN(Date.parse(dateStr))) continue;

    let assigned: string | null = null;
    for (const bk of bucketKeys) {
      if (dateStr >= bk) assigned = bk;
    }

    if (assigned && buckets[assigned]) {
      buckets[assigned].sent++;
      if (msg.delivered) buckets[assigned].delivered++;
      if (msg.opened) buckets[assigned].opened++;
      if (msg.has_reply || (msg.reply_count && msg.reply_count > 0)) {
        buckets[assigned].replied++;
      }
    }
  }

  const series: OpenRateTrendPoint[] = bucketKeys.map((week) => ({
    week,
    sent: buckets[week].sent,
    delivered: buckets[week].delivered,
    opened: buckets[week].opened,
    replied: buckets[week].replied,
    open_rate:
      buckets[week].sent > 0
        ? Math.round((buckets[week].opened / buckets[week].sent) * 1000) / 10
        : 0,
    reply_rate:
      buckets[week].sent > 0
        ? Math.round((buckets[week].replied / buckets[week].sent) * 1000) / 10
        : 0,
  }));

  return { series };
}

export async function getReplyRateByDimension(
  dimension: "tone_tier" | "step_number" | "variant"
): Promise<{ points: ReplyRateByDimensionPoint[] }> {
  const msgs = await getAllSentOutreachMessages();
  if (!msgs.length) return { points: [] };

  const grouped: Record<string, { sent: number; replied: number }> = {};

  for (const msg of msgs) {
    let rawValue: string;
    if (dimension === "tone_tier") {
      rawValue = msg.tone_tier ?? "unknown";
    } else if (dimension === "step_number") {
      rawValue = String(msg.step_number ?? 1);
    } else {
      rawValue = msg.variant ?? "A";
    }

    if (!grouped[rawValue]) grouped[rawValue] = { sent: 0, replied: 0 };
    grouped[rawValue].sent++;
    if (msg.has_reply || (msg.reply_count && msg.reply_count > 0)) {
      grouped[rawValue].replied++;
    }
  }

  const points: ReplyRateByDimensionPoint[] = Object.entries(grouped).map(([raw, counts]) => {
    let label: string;
    if (dimension === "step_number") {
      label = `Step ${raw}`;
    } else if (dimension === "variant") {
      label = `Variant ${raw}`;
    } else {
      label = raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ");
    }
    return {
      label,
      sent: counts.sent,
      replied: counts.replied,
      reply_rate:
        counts.sent > 0
          ? Math.round((counts.replied / counts.sent) * 1000) / 10
          : 0,
    };
  });

  points.sort((a, b) => b.reply_rate - a.reply_rate);
  return { points };
}

export async function getSubjectLineStats(): Promise<{ subjects: SubjectLineStat[] }> {
  const snap = await getDocs(collection(db, "outreach_messages"));
  const msgs = snap.docs.map((d) => d.data());

  // Only count sent messages (includes those that got replies)
  const sentMsgs = msgs.filter((m) => ["sent", "replied"].includes(m.status) || m.sent_at);

  const bySubject: Record<string, { sent: number; replied: number; subject: string }> = {};

  for (const msg of sentMsgs) {
    const subject = msg.subject || "(no subject)";
    if (!bySubject[subject]) {
      bySubject[subject] = { sent: 0, replied: 0, subject };
    }
    bySubject[subject].sent++;
    if (msg.has_reply || (msg.reply_count && msg.reply_count > 0)) {
      bySubject[subject].replied++;
    }
  }

  const subjects: SubjectLineStat[] = Object.values(bySubject)
    .map((s) => ({
      subject: s.subject,
      sent: s.sent,
      replied: s.replied,
      reply_rate: s.sent > 0 ? Math.round((s.replied / s.sent) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.reply_rate - a.reply_rate || b.sent - a.sent);

  return { subjects };
}
