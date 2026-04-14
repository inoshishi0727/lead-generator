import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Resend webhook for email tracking events (open, delivered, clicked).
 * Register this URL in Resend dashboard: https://asterleyleadgen.netlify.app/api/email-events
 *
 * Resend sends events like:
 * { type: "email.opened", data: { email_id: "uuid", ... } }
 * { type: "email.delivered", data: { email_id: "uuid", ... } }
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    if (!type || !data?.email_id) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    const emailId = data.email_id;

    // Find the outreach message by email_message_id
    const snap = await adminDb
      .collection("outreach_messages")
      .where("email_message_id", "==", emailId)
      .limit(1)
      .get();

    if (snap.empty) {
      console.log("Email event for unknown message:", emailId, type);
      return NextResponse.json({ status: "ignored", reason: "message not found" });
    }

    const docRef = snap.docs[0].ref;
    const now = new Date().toISOString();

    switch (type) {
      case "email.opened":
        await docRef.update({
          opened: true,
          open_count: FieldValue.increment(1),
          last_opened_at: now,
        });
        console.log("Email opened:", emailId);
        break;

      case "email.delivered":
        await docRef.update({
          delivered: true,
          delivered_at: now,
        });
        console.log("Email delivered:", emailId);
        break;

      case "email.clicked":
        console.log("Email link clicked:", emailId);
        break;

      case "email.bounced":
        await docRef.update({
          status: "bounced",
        });
        console.log("Email bounced:", emailId);
        break;

      default:
        console.log("Unhandled email event:", type, emailId);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Email event webhook error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
