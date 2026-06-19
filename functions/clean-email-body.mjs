/**
 * Server-side HTML→text helper used by processInboundEmail. Quoted-reply
 * stripping stays in `stripQuotedReply()` inside functions/index.js because it
 * was already in place before this fix; we just feed it cleaner text now.
 */
import { convert } from "html-to-text";

const HTML_TAG = /<[a-z!][^>]*>/i;

const HTML_TO_TEXT_OPTS = {
  wordwrap: false,
  selectors: [
    { selector: "a", options: { ignoreHref: true } },
    { selector: "img", format: "skip" },
    { selector: "style", format: "skip" },
    { selector: "script", format: "skip" },
    { selector: "head", format: "skip" },
  ],
};

export function htmlBodyToText(html) {
  if (!html) return "";
  return HTML_TAG.test(html) ? convert(html, HTML_TO_TEXT_OPTS) : html;
}
