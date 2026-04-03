import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// Resend inbound webhook — fired when a lead replies to an outreach email.
// The reply-to address is encoded as: reply+{lead_id}@reply.asterleybros.com
// We parse lead_id from that address, update the message and lead in Firestore,
// and write an inbound_replies record.

function parseLeadId(toAddress: string): string | null {
  const match = toAddress.match(/reply\+([^@]+)@/);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body?.type !== "email.received") {
      return NextResponse.json({ ok: true });
    }

    const emailData = body.data;
    const toAddresses: string[] = emailData?.to ?? [];
    const fromAddress: string = emailData?.from ?? "";
    const subject: string = emailData?.subject ?? "";
    const emailId: string = emailData?.email_id ?? "";

    // Find the reply+{lead_id} address in the to list
    let leadId: string | null = null;
    for (const addr of toAddresses) {
      leadId = parseLeadId(addr);
      if (leadId) break;
    }

    if (!leadId) {
      console.warn("Inbound email with no lead_id in to address", toAddresses);
      return NextResponse.json({ ok: true });
    }

    // Find the sent outreach message for this lead
    const msgSnap = await adminDb
      .collection("outreach_messages")
      .where("lead_id", "==", leadId)
      .where("status", "==", "sent")
      .orderBy("sent_at", "desc")
      .limit(1)
      .get();

    const now = new Date().toISOString();

    if (!msgSnap.empty) {
      const msgDoc = msgSnap.docs[0];
      await msgDoc.ref.update({
        has_reply: true,
        reply_count: FieldValue.increment(1),
      });
    }

    // Update lead stage to responded
    await adminDb.collection("leads").doc(leadId).update({
      stage: "responded",
    });

    // Write inbound reply record
    await adminDb.collection("inbound_replies").add({
      lead_id: leadId,
      message_id: msgSnap.empty ? null : msgSnap.docs[0].id,
      from_email: fromAddress,
      from_name: null,
      subject,
      body: null, // body not included in Resend webhook metadata — fetch via Resend API if needed
      source: "email",
      matched: true,
      resend_email_id: emailId,
      created_at: now,
    });

    console.log("Inbound reply matched to lead", leadId, "from", fromAddress);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Inbound webhook error:", err.message);
    // Still return 200 so Resend doesn't retry
    return NextResponse.json({ ok: true });
  }
}
