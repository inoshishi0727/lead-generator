import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { hasVps, getVpsWsUrl } from "@/lib/vps-api";

const WS_URL = typeof window !== "undefined" && hasVps ? getVpsWsUrl() : "";

// --- Generating leads tracker (module-level singleton) ---
let _generatingLeadId: string | null = null;
let _listeners = new Set<() => void>();

function getSnapshot() {
  return _generatingLeadId;
}

function subscribe(listener: () => void) {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

function setGeneratingLead(leadId: string | null) {
  _generatingLeadId = leadId;
  _listeners.forEach((fn) => fn());
}

/** Returns the lead_id currently being drafted, or null. */
export function useGeneratingLeadId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/**
 * Connects to the backend WebSocket and invalidates TanStack Query cache
 * when data changes. Drop this into layout — it runs once globally.
 */
export function useLiveUpdates() {
  const qc = useQueryClient();

  useEffect(() => {
    if (!WS_URL) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(WS_URL);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const type = data.type as string;

          if (type === "leads_updated") {
            qc.invalidateQueries({ queryKey: ["leads"] });
            qc.invalidateQueries({ queryKey: ["analytics"] });
          } else if (type === "enrichment_done") {
            qc.invalidateQueries({ queryKey: ["leads"] });
            qc.invalidateQueries({ queryKey: ["analytics"] });
          } else if (type === "draft_generating") {
            // A specific lead is currently being drafted
            setGeneratingLead(data.lead_id ?? null);
          } else if (type === "draft_ready") {
            // A draft just finished for this lead
            setGeneratingLead(null);
            qc.invalidateQueries({ queryKey: ["outreach"] });
          } else if (type === "drafts_generated") {
            setGeneratingLead(null);
            qc.invalidateQueries({ queryKey: ["outreach"] });
          } else if (type === "messages_sent") {
            qc.invalidateQueries({ queryKey: ["outreach"] });
            qc.invalidateQueries({ queryKey: ["leads"] });
          } else if (type === "scores_updated") {
            qc.invalidateQueries({ queryKey: ["leads"] });
            qc.invalidateQueries({ queryKey: ["analytics"] });
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [qc]);
}
