/**
 * Team-level analytics: per-member metrics computed directly from Firestore.
 */
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import type { MemberMetrics } from "./types";

async function getAllUsers(): Promise<any[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ ...d.data(), uid: d.id }));
}

async function getAllLeads(): Promise<any[]> {
  const snap = await getDocs(collection(db, "leads"));
  return snap.docs.map((d) => d.data());
}

async function getSentMessages(): Promise<any[]> {
  const snap = await getDocs(collection(db, "outreach_messages"));
  return snap.docs
    .map((d) => d.data())
    .filter((msg) => msg.status === "sent" && msg.channel === "email");
}

export async function getTeamMetrics(): Promise<MemberMetrics[]> {
  const users = await getAllUsers();
  const leads = await getAllLeads();
  const sentMessages = await getSentMessages();

  // Build metrics for each user
  const metricsMap: Record<string, MemberMetrics> = {};

  for (const user of users) {
    const uid = user.uid || "";
    const userLeads = leads.filter((lead) => lead.assigned_to === uid);
    const userMessages = sentMessages.filter((msg) => msg.assigned_to === uid);

    // Count opens and replies
    let emailsOpened = 0;
    let repliesReceived = 0;
    const stageMap: Record<string, number> = {};

    for (const msg of userMessages) {
      if (msg.opened) {
        emailsOpened++;
      }
      if (msg.has_reply) {
        repliesReceived++;
      }
    }

    // Group leads by stage
    for (const lead of userLeads) {
      const stage = lead.stage || "scraped";
      stageMap[stage] = (stageMap[stage] || 0) + 1;
    }

    // Count conversions: leads with stage === "converted" and assigned to this user
    const leadsConverted = userLeads.filter((lead) => lead.stage === "converted").length;

    // Calculate rates
    const emailsSent = userMessages.length;
    const openRate =
      emailsSent > 0 ? Math.round((emailsOpened / emailsSent) * 1000) / 10 : 0;
    const replyRate =
      emailsSent > 0 ? Math.round((repliesReceived / emailsSent) * 1000) / 10 : 0;

    metricsMap[uid] = {
      uid,
      display_name: user.display_name || "Unknown",
      email: user.email || "",
      role: user.role || "viewer",
      assigned_leads: userLeads.length,
      emails_sent: emailsSent,
      emails_opened: emailsOpened,
      open_rate: openRate,
      replies_received: repliesReceived,
      reply_rate: replyRate,
      leads_converted: leadsConverted,
      leads_by_stage: stageMap,
    };
  }

  // Convert to array and sort by assigned_leads descending
  return Object.values(metricsMap).sort(
    (a, b) => b.assigned_leads - a.assigned_leads
  );
}
