// Backfill: read each replied lead's FULL conversation thread, classify with
// Gemini into hot/warm/not_interested (+ revisit month), write thread_* fields,
// recompute auto_tags. Mirrors classifyLeadThread + computeAutoTags in index.js.
// Real data only — no fabricated leads. Uses ADC + GEMINI_API_KEY from .env.local.
//
// Usage:  node backfill-thread-tags.mjs --dry-run   (preview, no writes)
//         node backfill-thread-tags.mjs             (write)
import { readFileSync } from "node:fs";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI } from "@google/genai";

const app = getApps().length ? getApps()[0] : initializeApp({ projectId: "asterley-bros-b29c0" });
const db = getFirestore(app);
const DRY = process.argv.includes("--dry-run");

const envText = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
const apiKey = (envText.match(/GEMINI_API_KEY=(.+)/) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (!apiKey) { console.error("no GEMINI_API_KEY in functions/.env.local"); process.exit(1); }
const ai = new GoogleGenAI({ apiKey });

const ENGAGED_OPEN_THRESHOLD = 3, GHOSTED_WINDOW_DAYS = 7;
const GHOSTED_STAGES = new Set(["sent", "follow_up_1", "follow_up_2"]);
const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);

function computeAutoTags(lead, messages) {
  const tags = new Set();
  const msgs = messages || [];
  const openCount = Number(lead.open_count) || 0, replyCount = Number(lead.reply_count) || 0;
  const rated = msgs.filter((m) => m && m.content_rating && m.content_rated_at)
    .sort((a, b) => String(b.content_rated_at).localeCompare(String(a.content_rated_at)));
  const quality = lead.thread_rating || (rated.length ? rated[0].content_rating : null);
  const anyNI = msgs.some((m) => m && m.content_rating === "not_interested");
  const outcomeNI = lead.outcome === "lost" || lead.outcome === "not_interested";
  if (outcomeNI || quality === "not_interested" || anyNI) tags.add("not_interested");
  else if (quality === "great") tags.add("hot");
  else if (quality === "good") tags.add("warm");
  if (openCount >= ENGAGED_OPEN_THRESHOLD && replyCount === 0) tags.add("engaged_no_reply");
  if (GHOSTED_STAGES.has(lead.stage) && openCount === 0 && replyCount === 0) {
    const st = msgs.map((m) => m && m.sent_at).filter(Boolean).map((t) => new Date(t).getTime()).filter((n) => !Number.isNaN(n));
    const last = st.length ? Math.max(...st) : (lead.scraped_at ? new Date(lead.scraped_at).getTime() : NaN);
    if (!Number.isNaN(last) && (Date.now() - last) / 864e5 > GHOSTED_WINDOW_DAYS) tags.add("ghosted");
  }
  for (const rm of [lead.thread_revisit_month, ...msgs.map((m) => m && m.revisit_month)]) {
    if (typeof rm === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(rm) && rm >= currentMonth) tags.add(`revisit:${rm}`);
  }
  return [...tags].sort();
}

async function classifyThread(leadId) {
  const [msgSnap, replySnap] = await Promise.all([
    db.collection("outreach_messages").where("lead_id", "==", leadId).get(),
    db.collection("inbound_replies").where("lead_id", "==", leadId).get(),
  ]);
  const turns = [];
  msgSnap.docs.forEach((d) => { const m = d.data(); if (m.status === "sent" || m.sent_at) turns.push({ t: m.sent_at || m.created_at || "", who: "US", text: `${m.subject ? m.subject + " — " : ""}${m.content || ""}` }); });
  replySnap.docs.forEach((d) => { const r = d.data(); if (r.direction === "outbound") turns.push({ t: r.created_at || "", who: "US", text: r.body || "" }); else if (!r.is_auto_reply && r.body) turns.push({ t: r.created_at || "", who: "THEM", text: r.body || "" }); });
  if (!turns.some((x) => x.who === "THEM")) return null;
  turns.sort((a, b) => String(a.t).localeCompare(String(b.t)));
  const transcript = turns.map((x) => `${x.who}: ${String(x.text).replace(/\s+/g, " ").trim().slice(0, 800)}`).join("\n").slice(0, 8000);

  const prompt = `You are classifying a B2B spirits/drinks sales conversation to route the lead. Today is ${today}.
Read the WHOLE thread below (US = our sales team, THEM = the prospect) and judge the prospect's CURRENT stance from the entire exchange, not just one message.

THREAD:
"""
${transcript}
"""

Return ONLY valid JSON:
{"rating": "great" | "good" | "not_interested", "reason": "<15-20 words>", "revisit_month": "<YYYY-MM or null>", "revisit_reason": "<12 words or fewer, or null>"}

Rating: "great"=strong buy signal (meeting/tasting/samples/pricing/enthusiasm/introduces buyer); "good"=mild positive (curious/open/asks question, no firm objection); "not_interested"=declines/already supplied/unsubscribe/no budget/went cold.
Revisit: if they ask to be contacted later, resolve to YYYY-MM relative to today (spring→03, summer→06, autumn→09, winter→12; new year→next Jan; next quarter→first month of next quarter); else null.`;

  try {
    const res = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt, config: { maxOutputTokens: 600, temperature: 0.1 } });
    let text = (res.text || "").replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s >= 0 && e > s) {
      const p = JSON.parse(text.slice(s, e + 1));
      if (!["great", "good", "not_interested"].includes(p.rating)) return null;
      const rm = typeof p.revisit_month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p.revisit_month) ? p.revisit_month : null;
      return { thread_rating: p.rating, thread_rating_reason: p.reason || null, thread_revisit_month: rm, thread_revisit_reason: rm ? (p.revisit_reason || null) : null };
    }
  } catch (err) { console.warn(`  classify failed for ${leadId}:`, err.message); }
  return null;
}

async function main() {
  // Replied leads = those with inbound replies. Pull distinct lead_ids from inbound_replies.
  const replySnap = await db.collection("inbound_replies").get();
  const leadIds = [...new Set(replySnap.docs.map((d) => d.data().lead_id).filter(Boolean))];
  console.log(`Replied leads to classify: ${leadIds.length}${DRY ? " (DRY RUN)" : ""}`);

  const tally = {};
  let updated = 0;
  for (const leadId of leadIds) {
    const leadRef = db.collection("leads").doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) continue;
    const lead = leadSnap.data();
    const classification = await classifyThread(leadId);
    const merged = { ...lead, ...(classification || {}) };
    const msgSnap = await db.collection("outreach_messages").where("lead_id", "==", leadId).get();
    const next = computeAutoTags(merged, msgSnap.docs.map((d) => d.data()));
    for (const t of next) tally[t] = (tally[t] || 0) + 1;
    console.log(`  ${(lead.business_name || leadId).slice(0, 36).padEnd(36)} ${classification?.thread_rating || "—"} → ${next.join(", ") || "(none)"}`);
    if (!DRY) {
      const patch = { auto_tags: next, auto_tags_updated_at: new Date().toISOString() };
      if (classification) Object.assign(patch, classification, { thread_rated_at: new Date().toISOString() });
      await leadRef.update(patch);
      updated++;
    }
  }
  console.log(`\n${DRY ? "Would update" : "Updated"}: ${updated || leadIds.length} leads`);
  console.log("Tag tally:", JSON.stringify(tally, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
