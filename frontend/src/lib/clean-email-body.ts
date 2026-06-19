/**
 * Clean a stored or freshly-ingested reply body for display.
 *
 * Marketing senders (Mailchimp, vendor responders) ship HTML-only emails so the
 * raw `<style>` and `<table>` tags end up in `inbound_replies.body` and render
 * verbatim through `whitespace-pre-wrap`. We convert HTML to readable text and
 * strip Gmail/Outlook quoted history so only the new message is shown.
 *
 * The previous version used `email-reply-parser`, but that package uses Node's
 * `module.createRequire` which can't be bundled into the browser. We mirror the
 * server's `stripQuotedReply()` (functions/index.js) instead — same heuristics,
 * no runtime dependency.
 */
import { convert, type HtmlToTextOptions } from "html-to-text";

const HTML_TAG = /<[a-z!][^>]*>/i;

const HTML_TO_TEXT_OPTS: HtmlToTextOptions = {
  wordwrap: false,
  selectors: [
    { selector: "a", options: { ignoreHref: true } },
    { selector: "img", format: "skip" },
    { selector: "style", format: "skip" },
    { selector: "script", format: "skip" },
    { selector: "head", format: "skip" },
  ],
};

const CUT_PATTERNS: RegExp[] = [
  /^-{2,}\s*Original Message\s*-{2,}/i, // Outlook
  /^_{2,}/, // Outlook underscores
  /^From:\s+/, // Outlook/generic header
  /^Sent from my /, // mobile signature preamble
  /^Get Outlook for /,
];

function stripQuotedReply(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (CUT_PATTERNS.some((p) => p.test(trimmed))) {
      return lines.slice(0, i).join("\n").trim();
    }
    // Gmail single-line: "On Mon, Apr 6, 2026 at 5:58 PM Name <email> wrote:"
    if (/wrote:\s*$/.test(trimmed) && /^On\s/.test(trimmed)) {
      return lines.slice(0, i).join("\n").trim();
    }
    // Gmail multi-line: "On Mon, Apr 6, 2026 at 5:58 PM Name <email>\nwrote:"
    if (trimmed === "wrote:" && i > 0 && /^On\s/.test(lines[i - 1].trim())) {
      return lines.slice(0, i - 1).join("\n").trim();
    }
    // Lines starting with ">" are quoted; walk back over any "On ... wrote:" header.
    if (trimmed.startsWith(">") && i > 0) {
      let cutLine = i;
      if (/wrote:\s*$/.test(lines[i - 1].trim())) {
        cutLine = i - 1;
        if (cutLine > 0 && /^On\s/.test(lines[cutLine - 1].trim())) {
          cutLine = cutLine - 1;
        }
      }
      return lines.slice(0, cutLine).join("\n").trim();
    }
  }
  return text.trim();
}

export function cleanEmailBody(body: string | null | undefined): string {
  if (!body) return "";
  const text = HTML_TAG.test(body) ? convert(body, HTML_TO_TEXT_OPTS) : body;
  return stripQuotedReply(text).replace(/\n{3,}/g, "\n\n").trim();
}
