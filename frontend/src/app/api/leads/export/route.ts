import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(cells: (string | null | undefined)[]): string {
  return cells.map(escapeCsv).join(",");
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stageFilter = searchParams.get("stage") || "";

    // Fetch leads
    let leadsQuery: FirebaseFirestore.Query = adminDb.collection("leads");
    if (stageFilter) {
      leadsQuery = leadsQuery.where("stage", "==", stageFilter);
    }
    const leadsSnap = await leadsQuery.get();

    // Fetch all sent outreach_messages, group by lead_id
    const msgsSnap = await adminDb
      .collection("outreach_messages")
      .where("status", "==", "sent")
      .orderBy("sent_at", "asc")
      .get();

    // Build map: lead_id -> first sent message
    const firstSentByLead = new Map<string, FirebaseFirestore.DocumentData>();
    for (const doc of msgsSnap.docs) {
      const d = doc.data();
      if (d.lead_id && !firstSentByLead.has(d.lead_id)) {
        firstSentByLead.set(d.lead_id, d);
      }
    }

    const headers = [
      "Account Name",
      "Method of Contact",
      "Address",
      "Email Address",
      "Date of Contact",
      "Owner",
      "Email Copy",
      "Client Status",
    ];

    const lines: string[] = [headers.join(",")];

    for (const doc of leadsSnap.docs) {
      const lead = doc.data();
      const msg = firstSentByLead.get(doc.id);

      const methodOfContact = msg?.channel === "instagram_dm" ? "Instagram DM" : msg?.channel === "email" ? "Email" : "";
      const dateOfContact = msg?.sent_at
        ? new Date(msg.sent_at).toLocaleDateString("en-GB")
        : "";
      const owner = msg?.assigned_to_name || lead.assigned_to_name || "";
      const emailCopy = msg?.content || "";

      lines.push(
        row([
          lead.business_name,
          methodOfContact,
          lead.address,
          lead.contact_email || lead.email,
          dateOfContact,
          owner,
          emailCopy,
          lead.stage,
        ])
      );
    }

    const csv = lines.join("\r\n");
    const filename = `asterley-leads-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
