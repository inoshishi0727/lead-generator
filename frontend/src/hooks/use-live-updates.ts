import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;
const WS_URL =
  typeof window !== "undefined" && hasBackend
    ? `ws://${window.location.hostname}:8000/ws`
    : "";

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
          } else if (type === "drafts_generated") {
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
        // Auto-reconnect after 3s
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
