import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";

const SENDER_EMAIL = "rob@asterleybros.com";
const SENDER_NAME = "Rob from Asterley Bros";
const REPLY_DOMAIN = "replies.asterleybros.com";
const DAILY_CAP = 150;

// HTML email signature — appended at send time, not stored in message content.
// Duplicated in src/outreach/email_sender.py and functions/index.js.
const EMAIL_SIGNATURE_HTML = `\
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333;">
  <tr>
    <td style="padding-top: 12px; border-top: 1px solid #ddd;">
      <strong>Robert Berry</strong>&nbsp;&nbsp;|&nbsp;&nbsp;Co-founder<br>
      <a href="tel:+447817478196" style="color: #333; text-decoration: none;">+44 7817 478196</a><br>
      <a href="https://www.asterleybros.com" style="color: #b5651d; text-decoration: none;">www.asterleybros.com</a>
    </td>
  </tr>
  <tr>
    <td style="padding-top: 10px;">
      <img src="https://cdn.shopify.com/s/files/1/0447/7521/1172/files/Awards_Only_SML.png?v=1774997201"
           alt="Asterley Bros Awards" width="300" style="display: block;" />
    </td>
  </tr>
</table>`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlEmail(content: string): string {
  const escaped = escapeHtml(content);
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;"><div style="white-space: pre-wrap;">${escaped}</div><br>${EMAIL_SIGNATURE_HTML}</div>`;
}

function isOptimalWindow(): boolean {
  const now = new Date();
  const london = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/London" })
  );
  const day = london.getDay();
  const hour = london.getHours();
  return [2, 3, 4].includes(day) && hour >= 10 && hour < 13;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const force = body?.force === true;

    // Optimal window check
    if (!force && !isOptimalWindow()) {
      return NextResponse.json({
        status: "warning",
        outside_optimal_window: true,
        sent: 0,
        failed: 0,
        total: 0,
      });
    }

    // Daily cap check
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const sentTodaySnap = await adminDb
      .collection("outreach_messages")
      .where("status", "==", "sent")
      .where("sent_at", ">=", todayMidnight.toISOString())
      .get();

    if (sentTodaySnap.size >= DAILY_CAP) {
      return NextResponse.json(
        { error: `Daily cap of ${DAILY_CAP} emails reached.` },
        { status: 429 }
      );
    }

    const remaining = DAILY_CAP - sentTodaySnap.size;

    // Get approved emails
    const approvedSnap = await adminDb
      .collection("outreach_messages")
      .where("status", "==", "approved")
      .where("channel", "==", "email")
      .get();

    if (approvedSnap.empty) {
      return NextResponse.json({
        status: "completed",
        sent: 0,
        failed: 0,
        total: 0,
      });
    }

    const messages = approvedSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Record<string, any>[];
    const toSend = messages.slice(0, remaining);

    // Init Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY not configured." },
        { status: 500 }
      );
    }
    const resend = new Resend(apiKey);

    let sent = 0;
    let failed = 0;

    for (const msg of toSend) {
      try {
        const leadSnap = await adminDb
          .collection("leads")
          .doc(msg.lead_id as string)
          .get();
        if (!leadSnap.exists) {
          console.error("Lead not found for message", msg.id);
          failed++;
          continue;
        }

        const lead = leadSnap.data()!;
        const toEmail = lead.contact_email || lead.email;
        if (!toEmail) {
          console.error("No email for lead", msg.lead_id, lead.business_name);
          failed++;
          continue;
        }

        // Encode lead_id in reply-to so inbound webhook can match replies
        const replyToAddress = `reply+${msg.lead_id}@${REPLY_DOMAIN}`;

        const { data: resendData, error } = await resend.emails.send({
          from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
          to: toEmail,
          replyTo: replyToAddress,
          subject: (msg.subject as string) || "Asterley Bros",
          text: msg.content as string,
          html: buildHtmlEmail(msg.content as string),
        });

        if (error) {
          throw new Error(error.message);
        }

        const now = new Date().toISOString();
        await adminDb
          .collection("outreach_messages")
          .doc(msg.id as string)
          .update({
            status: "sent",
            sent_at: now,
            reply_to_address: replyToAddress,
            email_message_id: resendData?.id ?? null,
          });

        await adminDb
          .collection("leads")
          .doc(msg.lead_id as string)
          .update({
            stage: "sent",
          });

        sent++;
        console.log("Sent to", toEmail, "for", lead.business_name);
      } catch (err: any) {
        console.error("Send failed for", msg.id, err.message);
        await adminDb
          .collection("outreach_messages")
          .doc(msg.id as string)
          .update({
            status: "bounced",
          });
        failed++;
      }
    }

    return NextResponse.json({
      status: "completed",
      sent,
      failed,
      total: toSend.length,
    });
  } catch (err: any) {
    console.error("Send endpoint error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
