"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const STORAGE_PREFIX = "lead-viewed:";
const CHANGE_EVENT = "lead-viewed:changed";

function storageKey(uid: string | null | undefined): string | null {
  if (!uid) return null;
  return `${STORAGE_PREFIX}${uid}`;
}

function readSet(uid: string | null | undefined): Set<string> {
  if (typeof window === "undefined") return new Set();
  const key = storageKey(uid);
  if (!key) return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((v): v is string => typeof v === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function writeSet(uid: string | null | undefined, set: Set<string>): void {
  if (typeof window === "undefined") return;
  const key = storageKey(uid);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { uid } }));
  } catch {
    // ignore quota / privacy errors
  }
}

export function markViewed(leadId: string, uid: string | null | undefined): void {
  if (!leadId || !uid) return;
  const set = readSet(uid);
  if (set.has(leadId)) return;
  set.add(leadId);
  writeSet(uid, set);
}

export function getViewedSet(uid: string | null | undefined): Set<string> {
  return readSet(uid);
}

export function useViewedLeads(): Set<string> {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [set, setSet] = useState<Set<string>>(() => readSet(uid));

  useEffect(() => {
    setSet(readSet(uid));
    if (typeof window === "undefined") return;

    const refresh = () => setSet(readSet(uid));

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ uid?: string | null }>).detail;
      if (!detail || detail.uid === uid) refresh();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(uid)) refresh();
    };

    const onFocus = () => refresh();

    window.addEventListener(CHANGE_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener(CHANGE_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [uid]);

  return set;
}
