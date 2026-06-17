"use client";

import { OutreachView } from "../outreach/page";

/**
 * Review is its own sidebar destination focused on the approval loop. The tab
 * strip is narrowed to Draft + Approved so the operator can switch between
 * the queue waiting for approval and approved drafts pending send — without
 * exposing Sent / Inbox / Rejected / Follow-ups / Clients (those live on the
 * full /outreach page).
 *
 * Defaults to the Draft tab on first load; Approved is one click away.
 */
export default function ReviewPage() {
  return (
    <OutreachView
      forcedTab="draft"
      allowedStatusTabs={["draft", "approved"]}
      hideMainTabs
      titleOverride="Review"
      initialMainTab="messages"
    />
  );
}
