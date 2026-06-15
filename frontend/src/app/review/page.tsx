"use client";

import { OutreachView } from "../outreach/page";

/**
 * Review is its own sidebar destination focused on a single workflow:
 * approving generated drafts. The status tab strip (Draft / Approved /
 * Scheduled / Sent / etc.) is hidden so the operator can only see drafts
 * here — no risk of accidentally landing in conversations or sent history.
 * Keeps the Generate Drafts / Approve all action buttons and the stat
 * cards visible since those are central to the daily review loop.
 */
export default function ReviewPage() {
  return (
    <OutreachView
      forcedTab="draft"
      hideTabStrip
      hideMainTabs
      titleOverride="Review"
      initialMainTab="messages"
    />
  );
}
