import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// Resend inbound webhook — fired when a lead replies to an outreach email.
// The reply-to address is encoded as: reply+{lead_id}@reply.asterleybros.com
// Resend webhooks only include metadata — we fetch the full body via their Receiving API.

function parseLeadId(toAddress: string): string | null {
  const match = toAddress.match(/reply\+([^@]+)@/);
  return match ? match[1] : null;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function fetchReceivedEmail(emailId: string): Promise<{
  text: string;
  html: string;
  fromName: string | null;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !emailId) {
    console.warn("fetchReceivedEmail: missing apiKey or emailId", { hasKey: !!apiKey, emailId });
    return { text: "", html: "", fromName: null };
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`Receiving API retry ${attempt}/${MAX_RETRIES} after ${RETRY_DELAY_MS}ms delay`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }

      const url = `https://api.resend.com/emails/receiving/${emailId}`;
      console.log(`Fetching received email: ${url} (attempt ${attempt})`);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const responseText = await res.text();

      if (!res.ok) {
        console.warn(`Receiving API returned ${res.status}:`, responseText.substring(0, 300));
        if (attempt < MAX_RETRIES) continue;
        return { text: "", html: "", fromName: null };
      }

      const data = JSON.parse(responseText);
      console.log("Receiving API response keys:", Object.keys(data).join(", "));

      const text = data.text ?? "";
      const html = data.html ?? "";

      if (!text && !html && attempt < MAX_RETRIES) {
        console.warn(`Receiving API returned empty body on attempt ${attempt}, retrying...`);
        continue;
      }

      return { text, html, fromName: null };
    } catch (err: any) {
      console.warn(`Receiving API error (attempt ${attempt}):`, err.message);
      if (attempt < MAX_RETRIES) continue;
      return { text: "", html: "", fromName: null };
    }
  }

  return { text: "", html: "", fromName: null };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Inbound webhook payload:", JSON.stringify(body).substring(0, 1000));

    if (body?.type !== "email.received") {
      console.log("Skipping non-email.received event:", body?.type);
      return NextResponse.json({ ok: true });
    }

    const emailData = body.data || body;
    const toAddresses: string[] = emailData?.to ?? [];
    const fromAddress: string = emailData?.from ?? "";
    const subject: string = emailData?.subject ?? "";
    const emailId: string = emailData?.email_id || emailData?.id || "";

    console.log("Parsed webhook:", { emailId, fromAddress, subject, toAddresses });

    // Fetch full email content via Resend Receiving API
    const fetched = await fetchReceivedEmail(emailId);

    // Fallback: some webhook versions may include body directly
    const textBody = fetched.text || emailData?.text || "";
    const htmlBody = fetched.html || emailData?.html || "";
    const fromName = fetched.fromName;
    const bodySource = fetched.text || fetched.html ? "receiving_api" : (emailData?.text || emailData?.html ? "webhook_payload" : "none");
    console.log("Email body result:", { bodySource, textLength: textBody.length, htmlLength: htmlBody.length });

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
      from_name: fromName,
      subject,
      body: textBody || htmlBody || "",
      body_html: htmlBody || "",
      source: "email",
      matched: true,
      resend_email_id: emailId,
      created_at: now,
    });

    console.log("Inbound reply processed for lead", leadId, "from", fromAddress);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Inbound webhook error:", err.message);
    // Still return 200 so Resend doesn't retry
    return NextResponse.json({ ok: true });
  }
}
