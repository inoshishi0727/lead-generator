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

export async function getTeamMetrics(): Promise<MemberMetrics[]> {
  try {
    const users = await getAllUsers();

    const metricsArr = await Promise.all(
      users.map(async (user) => {
        const uid = user.uid || "";

        const [leadsSnap, msgsSnap] = await Promise.all([
          getDocs(query(collection(db, "leads"), where("assigned_to", "==", uid))),
          getDocs(
            query(
              collection(db, "outreach_messages"),
              where("assigned_to", "==", uid),
              where("status", "==", "sent"),
              where("channel", "==", "email")
            )
          ),
        ]);

        const userLeads = leadsSnap.docs.map((d) => d.data());
        const userMessages = msgsSnap.docs.map((d) => d.data());

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

    return metricsArr.sort((a, b) => b.assigned_leads - a.assigned_leads);
  } catch (err) {
    console.error("[getTeamMetrics] failed:", err);
    throw err;
  }
}
