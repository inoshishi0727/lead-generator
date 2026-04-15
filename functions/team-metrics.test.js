import { test } from "node:test";
import assert from "node:assert";

/**
 * Pure function: compute metrics for a single team member.
 */
function computeMemberMetrics(user, allLeads, sentMessages) {
  const uid = user.uid || "";

  // Filter to leads and messages assigned to this user
  const userLeads = allLeads.filter((lead) => lead.assigned_to === uid);
  const userMessages = sentMessages.filter((msg) => msg.assigned_to === uid);

  // Count opens and replies
  let emailsOpened = 0;
  let repliesReceived = 0;
  const stageMap = {};

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

  // Count conversions
  const leadsConverted = userLeads.filter((lead) => lead.stage === "converted").length;

  // Calculate rates
  const emailsSent = userMessages.length;
  const openRate =
    emailsSent > 0 ? Math.round((emailsOpened / emailsSent) * 1000) / 10 : 0;
  const replyRate =
    emailsSent > 0 ? Math.round((repliesReceived / emailsSent) * 1000) / 10 : 0;

  return {
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

test("computeMemberMetrics - filters own leads only", () => {
  const user = { uid: "alice", display_name: "Alice", email: "alice@example.com", role: "admin" };
  const allLeads = [
    { id: "l1", assigned_to: "alice", stage: "sent" },
    { id: "l2", assigned_to: "bob", stage: "sent" },
    { id: "l3", assigned_to: "alice", stage: "converted" },
  ];
  const sentMessages = [];

  const metrics = computeMemberMetrics(user, allLeads, sentMessages);
  assert.strictEqual(metrics.assigned_leads, 2, "Should count only Alice's leads");
  assert.strictEqual(metrics.leads_converted, 1, "Should count only Alice's conversions");
});

test("computeMemberMetrics - groups leads by stage", () => {
  const user = { uid: "bob", display_name: "Bob", email: "bob@example.com", role: "member" };
  const allLeads = [
    { id: "l1", assigned_to: "bob", stage: "sent" },
    { id: "l2", assigned_to: "bob", stage: "sent" },
    { id: "l3", assigned_to: "bob", stage: "responded" },
    { id: "l4", assigned_to: "bob", stage: "converted" },
  ];
  const sentMessages = [];

  const metrics = computeMemberMetrics(user, allLeads, sentMessages);
  assert.deepStrictEqual(metrics.leads_by_stage, {
    sent: 2,
    responded: 1,
    converted: 1,
  }, "Should group leads by stage");
});

test("computeMemberMetrics - calculates open_rate", () => {
  const user = { uid: "carol", display_name: "Carol", email: "carol@example.com", role: "member" };
  const allLeads = [];
  const sentMessages = [
    { id: "m1", assigned_to: "carol", opened: true, has_reply: false },
    { id: "m2", assigned_to: "carol", opened: true, has_reply: false },
    { id: "m3", assigned_to: "carol", opened: false, has_reply: false },
    { id: "m4", assigned_to: "carol", opened: false, has_reply: false },
  ];

  const metrics = computeMemberMetrics(user, allLeads, sentMessages);
  assert.strictEqual(metrics.emails_sent, 4, "Should count 4 emails sent");
  assert.strictEqual(metrics.emails_opened, 2, "Should count 2 emails opened");
  assert.strictEqual(metrics.open_rate, 50, "Open rate should be 50%");
});

test("computeMemberMetrics - calculates reply_rate", () => {
  const user = { uid: "diana", display_name: "Diana", email: "diana@example.com", role: "member" };
  const allLeads = [];
  const sentMessages = [
    { id: "m1", assigned_to: "diana", opened: false, has_reply: true },
    { id: "m2", assigned_to: "diana", opened: false, has_reply: true },
    { id: "m3", assigned_to: "diana", opened: false, has_reply: false },
    { id: "m4", assigned_to: "diana", opened: false, has_reply: false },
    { id: "m5", assigned_to: "diana", opened: false, has_reply: false },
  ];

  const metrics = computeMemberMetrics(user, allLeads, sentMessages);
  assert.strictEqual(metrics.emails_sent, 5, "Should count 5 emails sent");
  assert.strictEqual(metrics.replies_received, 2, "Should count 2 replies");
  assert.strictEqual(metrics.reply_rate, 40, "Reply rate should be 40%");
});

test("computeMemberMetrics - zero emails sent returns 0 rates", () => {
  const user = { uid: "eve", display_name: "Eve", email: "eve@example.com", role: "member" };
  const allLeads = [{ id: "l1", assigned_to: "eve", stage: "scraped" }];
  const sentMessages = [];

  const metrics = computeMemberMetrics(user, allLeads, sentMessages);
  assert.strictEqual(metrics.emails_sent, 0, "Should have 0 emails sent");
  assert.strictEqual(metrics.open_rate, 0, "Open rate should be 0");
  assert.strictEqual(metrics.reply_rate, 0, "Reply rate should be 0");
});

test("computeMemberMetrics - no assigned leads returns 0", () => {
  const user = { uid: "frank", display_name: "Frank", email: "frank@example.com", role: "member" };
  const allLeads = [{ id: "l1", assigned_to: "alice", stage: "sent" }];
  const sentMessages = [];

  const metrics = computeMemberMetrics(user, allLeads, sentMessages);
  assert.strictEqual(metrics.assigned_leads, 0, "Should have 0 assigned leads");
  assert.strictEqual(metrics.leads_converted, 0, "Should have 0 conversions");
});

test("computeMemberMetrics - rate calculation precision", () => {
  const user = { uid: "grace", display_name: "Grace", email: "grace@example.com", role: "member" };
  const allLeads = [];
  const sentMessages = [
    { id: "m1", assigned_to: "grace", opened: true, has_reply: false },
    { id: "m2", assigned_to: "grace", opened: false, has_reply: false },
    { id: "m3", assigned_to: "grace", opened: false, has_reply: false },
  ];

  const metrics = computeMemberMetrics(user, allLeads, sentMessages);
  // 1/3 = 0.33333... → rounded to 33.3
  assert.strictEqual(metrics.open_rate, 33.3, "Open rate should be rounded to 1 decimal place");
});
