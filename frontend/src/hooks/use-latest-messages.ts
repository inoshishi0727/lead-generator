/**
 * useLatestMessagesForLeads — batch-load the latest outreach message per lead
 * for a small set of lead ids (≤ ~30). Replaces the dashboard's old practice of
 * pulling every message just to look up "what's the latest message for these
 * 10 plan leads".
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getMessagesByLeadIds } from "@/lib/firestore-api";
import type { OutreachMessage } from "@/lib/types";

export function useLatestMessagesForLeads(leadIds: string[]) {
  const stableKey = useMemo(() => [...leadIds].sort().join(","), [leadIds]);
  return useQuery<Map<string, OutreachMessage>>({
    queryKey: ["outreach", "latest-by-lead", stableKey],
    queryFn: async () => {
      const msgs = await getMessagesByLeadIds(leadIds);
      msgs.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
      const map = new Map<string, OutreachMessage>();
      for (const m of msgs) {
        if (!map.has(m.lead_id)) map.set(m.lead_id, m);
      }
      return map;
    },
    enabled: leadIds.length > 0,
    staleTime: 30_000,
  });
}
