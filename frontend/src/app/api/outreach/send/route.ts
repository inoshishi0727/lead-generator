import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import sgMail from "@sendgrid/mail";

const SENDER_EMAIL = "rob@asterleybros.com";
const SENDER_NAME = "Rob from Asterley Bros";
const DAILY_CAP = 150;

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

    // Init SendGrid
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "SENDGRID_API_KEY not configured." },
        { status: 500 }
      );
    }
    sgMail.setApiKey(apiKey);

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

        await sgMail.send({
          to: toEmail,
          from: { email: SENDER_EMAIL, name: SENDER_NAME },
          subject: (msg.subject as string) || "Asterley Bros",
          text: msg.content as string,
        });

        const now = new Date().toISOString();
        await adminDb
          .collection("outreach_messages")
          .doc(msg.id as string)
          .update({
            status: "sent",
            sent_at: now,
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
