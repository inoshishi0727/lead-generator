"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { watchRecentReplies, type ReplyNotification } from "@/lib/firestore-api";

const STORAGE_KEY = "asterley_last_read_at";

function getLastReadAt(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

function setLastReadAt(iso: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, iso);
}

export interface NotificationState {
  unreadCount: number;
  replies: ReplyNotification[];
  lastReadAt: string;
  markAllRead: () => void;
  markLeadRead: (leadId: string) => void;
}

export function useReplyNotifications(): NotificationState {
  const [unreadCount, setUnreadCount] = useState(0);
  const [replies, setReplies] = useState<ReplyNotification[]>([]);
  const [lastReadAt, setLastReadAtState] = useState<string>(() => getLastReadAt());
  const initialised = useRef(false);
  const knownIds = useRef<Set<string>>(new Set());

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setLastReadAt(now);
    setLastReadAtState(now);
    setUnreadCount(0);
  }, []);

  const markLeadRead = useCallback((leadId: string) => {
    setReplies((current) => {
      const leadReplies = current.filter((r) => r.lead_id === leadId);
      if (!leadReplies.length) return current;
      const newest = leadReplies.reduce((a, b) => a.created_at > b.created_at ? a : b);
      const currentLastRead = getLastReadAt();
      if (newest.created_at > currentLastRead) {
        setLastReadAt(newest.created_at);
        setLastReadAtState(newest.created_at);
        setUnreadCount((prev) => Math.max(0, prev - leadReplies.filter((r) => r.created_at > currentLastRead).length));
      }
      return current;
    });
  }, []);

  useEffect(() => {
    const unsub = watchRecentReplies((replies) => {
      const lastReadAt = getLastReadAt();

      setReplies(replies);

      if (!initialised.current) {
        // First snapshot — baseline, no toasts
        for (const r of replies) knownIds.current.add(r.id);
        const unread = lastReadAt
          ? replies.filter((r) => r.created_at > lastReadAt).length
          : 0;
        setUnreadCount(unread);
        initialised.current = true;
        return;
      }

      // Subsequent snapshots — detect truly new docs
      const newReplies = replies.filter((r) => !knownIds.current.has(r.id));
      for (const r of replies) knownIds.current.add(r.id);

      if (newReplies.length === 0) return;

      for (const r of newReplies) {
        const name = r.business_name || r.from_name || r.from_email;
        toast.info(`💬 New reply from ${name}`, {
          description: "Go to Conversations to view it.",
          duration: 8000,
          action: {
            label: "View",
            onClick: () => {
              window.location.href = "/outreach?tab=conversations";
            },
          },
        });
      }

      setUnreadCount((prev) => prev + newReplies.length);
    });

    return unsub;
  }, []);

  return { unreadCount, replies, lastReadAt, markAllRead, markLeadRead };
}
