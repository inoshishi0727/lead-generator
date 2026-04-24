/**
 * Team-level analytics: per-member metrics computed directly from Firestore.
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { MemberMetrics } from "./types";

async function getAllUsers(): Promise<any[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ ...d.data(), uid: d.id }));
}

// Fetch only sent emails — much smaller than full collection scan
async function getAllSentEmails(): Promise<any[]> {
  const snap = await getDocs(
    query(
      collection(db, "outreach_messages"),
      where("status", "==", "sent"),
      where("channel", "==", "email")
    )
  );
  return snap.docs.map((d) => d.data());
}

export async function getTeamMetrics(): Promise<MemberMetrics[]> {
  try {
    const [users, allSentEmails] = await Promise.all([getAllUsers(), getAllSentEmails()]);

    // Group sent emails by assigned_to (null → "unassigned")
    const msgsByUser = new Map<string, any[]>();
    for (const msg of allSentEmails) {
      const key = msg.assigned_to || "unassigned";
      if (!msgsByUser.has(key)) msgsByUser.set(key, []);
      msgsByUser.get(key)!.push(msg);
    }

    // Per-user lead queries in parallel
    const metricsArr = await Promise.all(
      users.map(async (user) => {
        const uid = user.uid || "";
        const leadsSnap = await getDocs(
          query(collection(db, "leads"), where("assigned_to", "==", uid))
        );
        const userLeads = leadsSnap.docs.map((d) => d.data());
        const userMessages = msgsByUser.get(uid) ?? [];

        let emailsOpened = 0;
        let repliesReceived = 0;
        const stageMap: Record<string, number> = {};

        for (const msg of userMessages) {
          if (msg.opened) emailsOpened++;
          if (msg.has_reply) repliesReceived++;
        }
        for (const lead of userLeads) {
          const stage = lead.stage || "scraped";
          stageMap[stage] = (stageMap[stage] || 0) + 1;
        }

        const emailsSent = userMessages.length;
        return {
          uid,
          display_name: user.display_name || "Unknown",
          email: user.email || "",
          role: user.role || "viewer",
          assigned_leads: userLeads.length,
          emails_sent: emailsSent,
          emails_opened: emailsOpened,
          open_rate: emailsSent > 0 ? Math.round((emailsOpened / emailsSent) * 1000) / 10 : 0,
          replies_received: repliesReceived,
          reply_rate: emailsSent > 0 ? Math.round((repliesReceived / emailsSent) * 1000) / 10 : 0,
          leads_converted: userLeads.filter((l) => l.stage === "converted").length,
          leads_by_stage: stageMap,
        } as MemberMetrics;
      })
    );

    // Add unassigned bucket if any orphaned sent emails exist
    const unassignedMsgs = msgsByUser.get("unassigned") ?? [];
    if (unassignedMsgs.length > 0) {
      let emailsOpened = 0;
      let repliesReceived = 0;
      for (const msg of unassignedMsgs) {
        if (msg.opened) emailsOpened++;
        if (msg.has_reply) repliesReceived++;
      }
      const emailsSent = unassignedMsgs.length;
      metricsArr.push({
        uid: "unassigned",
        display_name: "Unassigned",
        email: "",
        role: "viewer",
        assigned_leads: 0,
        emails_sent: emailsSent,
        emails_opened: emailsOpened,
        open_rate: emailsSent > 0 ? Math.round((emailsOpened / emailsSent) * 1000) / 10 : 0,
        replies_received: repliesReceived,
        reply_rate: emailsSent > 0 ? Math.round((repliesReceived / emailsSent) * 1000) / 10 : 0,
        leads_converted: 0,
        leads_by_stage: {},
      });
    }

    return metricsArr.sort((a, b) => b.emails_sent - a.emails_sent);
  } catch (err) {
    console.error("[getTeamMetrics] failed:", err);
    throw err;
  }
}
