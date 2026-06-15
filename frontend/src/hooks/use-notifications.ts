"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { watchRecentReplies, type ReplyNotification } from "@/lib/firestore-api";

const STORAGE_KEY = "asterley_read_at_by_lead";

const LEGACY_KEY = "asterley_last_read_at";

function getReadMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
    // Migrate from old single-timestamp key — treat it as a global baseline
    const legacy = localStorage.getItem(LEGACY_KEY);
    return legacy ? { __global__: legacy } : {};
  } catch {
    return {};
  }
}

function setReadMap(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("asterley_read_map_updated"));
}

function isReplyRead(r: ReplyNotification, map: Record<string, string>): boolean {
  if (!r.lead_id) return false;
  const leadReadAt = map[r.lead_id] ?? map["__global__"];
  return !!leadReadAt && r.created_at <= leadReadAt;
}

export interface NotificationState {
  unreadCount: number;
  replies: ReplyNotification[];
  lastReadAt: string;
  readMap: Record<string, string>;
  markAllRead: () => void;
  markLeadRead: (leadId: string) => void;
  markLeadUnread: (leadId: string) => void;
}

export function useReplyNotifications(): NotificationState {
  const [unreadCount, setUnreadCount] = useState(0);
  const [replies, setReplies] = useState<ReplyNotification[]>([]);
  const [readMap, setReadMapState] = useState<Record<string, string>>(() => getReadMap());
  const initialised = useRef(false);
  const knownIds = useRef<Set<string>>(new Set());
  const repliesRef = useRef<ReplyNotification[]>([]);

  // Keep ref in sync so markLeadRead can access current replies without stale closure
  useEffect(() => { repliesRef.current = replies; }, [replies]);

  // lastReadAt kept for backwards-compat with consumers that use it
  const lastReadAt = Object.values(readMap).sort().at(-1) ?? "";

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    const next: Record<string, string> = { ...getReadMap() };
    for (const r of repliesRef.current) {
      if (r.lead_id) next[r.lead_id] = now;
    }
    setReadMap(next);
    setReadMapState(next);
    setUnreadCount(0);
  }, []);

  const markLeadRead = useCallback((leadId: string) => {
    const current = repliesRef.current;
    const leadReplies = current.filter((r) => r.lead_id === leadId);
    if (!leadReplies.length) return;
    const newest = leadReplies.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    const next = { ...getReadMap(), [leadId]: newest.created_at };
    setReadMap(next);
    setReadMapState(next);
    const nowUnread = current.filter((r) => r.lead_id && !isReplyRead(r, next)).length;
    setUnreadCount(nowUnread);
  }, []);

  /** Mark a lead unread by removing its read-timestamp from the map. The
   *  __global__ baseline still applies — if a reply is older than the global
   *  baseline, removing the lead key won't bring it back as unread. That's
   *  intentional and matches Gmail's behavior for very old read history. */
  const markLeadUnread = useCallback((leadId: string) => {
    const map = getReadMap();
    if (!(leadId in map)) return;
    const next = { ...map };
    delete next[leadId];
    setReadMap(next);
    setReadMapState(next);
    const nowUnread = repliesRef.current.filter((r) => r.lead_id && !isReplyRead(r, next)).length;
    setUnreadCount(nowUnread);
  }, []);

  // Sync read state when another hook instance (e.g. app-shell) marks a lead read
  useEffect(() => {
    const handler = () => {
      const map = getReadMap();
      setReadMapState(map);
      setUnreadCount(repliesRef.current.filter((r) => r.lead_id && !isReplyRead(r, map)).length);
    };
    window.addEventListener("asterley_read_map_updated", handler);
    return () => window.removeEventListener("asterley_read_map_updated", handler);
  }, []);

  useEffect(() => {
    const unsub = watchRecentReplies((incoming) => {
      const map = getReadMap();
      setReplies(incoming);

      if (!initialised.current) {
        for (const r of incoming) knownIds.current.add(r.id);
        const unread = incoming.filter((r) => r.lead_id && !isReplyRead(r, map)).length;
        setUnreadCount(unread);
        initialised.current = true;
        return;
      }

      const newReplies = incoming.filter((r) => !knownIds.current.has(r.id));
      for (const r of incoming) knownIds.current.add(r.id);

      if (newReplies.length === 0) return;

      for (const r of newReplies) {
        const name = r.business_name || r.from_name || r.from_email;
        toast.info(`💬 New reply from ${name}`, {
          description: "Go to Conversations to view it.",
          duration: 8000,
          action: {
            label: "View",
            onClick: () => { window.location.href = "/outreach?tab=conversations"; },
          },
        });
      }

      setUnreadCount((prev) => prev + newReplies.filter((r) => r.lead_id && !isReplyRead(r, map)).length);
    });

    return unsub;
  }, []);

  return { unreadCount, replies, lastReadAt, readMap, markAllRead, markLeadRead, markLeadUnread };
}
