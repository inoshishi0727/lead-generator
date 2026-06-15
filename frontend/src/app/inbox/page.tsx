"use client";

import { OutreachView } from "../outreach/page";

/**
 * Inbox is its own destination in the sidebar. It renders the same reactive-
 * triage view that used to live as a tab inside /outreach, but the in-page
 * tab strip is hidden and the title swaps to "Inbox" so it reads as a single-
 * purpose page.
 *
 * Backwards compat: old /outreach?tab=conversations links still work because
 * the underlying OutreachView state machinery accepts "conversations" as a
 * statusFilter value — it just doesn't surface a tab for it.
 */
export default function InboxPage() {
  return (
    <OutreachView
      forcedTab="conversations"
      hideTabStrip
      hideMainTabs
      simplifiedHeader
      titleOverride="Inbox"
      initialMainTab="messages"
    />
  );
}
