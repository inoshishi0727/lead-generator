import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { isInternalSession } from "@/lib/test-traffic";

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

function tsToIso(value: unknown): string {
  if (!value) return "";
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

function parseAssistantContent(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // raw not JSON — return as-is
  }
  return raw;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "csv").toLowerCase();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    // Admin opt-in: ?includeTest=1 to include internal QA sessions.
    const includeTest = searchParams.get("includeTest") === "1";

    let convQuery: FirebaseFirestore.Query = adminDb
      .collection("sommelier_conversations")
      .orderBy("createdAt", "desc");

    if (from) convQuery = convQuery.where("createdAt", ">=", new Date(from));
    if (to) convQuery = convQuery.where("createdAt", "<=", new Date(to));

    const convSnap = await convQuery.get();
    let excludedTest = 0;

    type ExportSession = {
      sessionId: string;
      createdAt: string;
      lastActive: string;
      pageUrl: string | null;
      messagesCount: number;
      firstUserMessage: string | null;
      source: string | null;
      messages: { role: string; content: string; createdAt: string }[];
    };

    const sessions: ExportSession[] = [];

    for (const doc of convSnap.docs) {
      const d = doc.data();
      if (!includeTest && isInternalSession({
        isTest: d.isTest === true,
        tags: Array.isArray(d.tags) ? d.tags : undefined,
        firstUserMessage: d.firstUserMessage ?? null,
        userEmail: d.userEmail ?? null,
        email: d.email ?? null,
        pageUrl: d.pageUrl ?? null,
      })) {
        excludedTest++;
        continue;
      }
      const msgsSnap = await doc.ref.collection("messages").orderBy("createdAt", "asc").get();
      const messages = msgsSnap.docs.map((m) => {
        const md = m.data();
        const content =
          md.role === "assistant" && typeof md.content === "string"
            ? parseAssistantContent(md.content)
            : md.content ?? "";
        return {
          role: md.role ?? "",
          content,
          createdAt: tsToIso(md.createdAt),
        };
      });

      sessions.push({
        sessionId: doc.id,
        createdAt: tsToIso(d.createdAt),
        lastActive: tsToIso(d.lastActive),
        pageUrl: d.pageUrl ?? null,
        messagesCount: d.messagesCount ?? messages.length,
        firstUserMessage: d.firstUserMessage ?? null,
        source: d.source ?? null,
        messages,
      });
    }

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      const filename = `sommelier-conversations-${stamp}.json`;
      return new NextResponse(JSON.stringify(sessions, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    // CSV: one row per message
    const headers = [
      "Session ID",
      "Session Started",
      "Page URL",
      "Source",
      "Message #",
      "Role",
      "Message At",
      "Content",
    ];
    const lines: string[] = [headers.join(",")];

    for (const s of sessions) {
      s.messages.forEach((m, i) => {
        lines.push(
          row([
            s.sessionId,
            s.createdAt,
            s.pageUrl,
            s.source,
            String(i + 1),
            m.role,
            m.createdAt,
            m.content,
          ])
        );
      });
    }

    const csv = lines.join("\r\n");
    const filename = `sommelier-conversations-${stamp}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Conversations export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
