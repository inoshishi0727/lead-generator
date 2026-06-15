"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, functions } from "@/lib/firebase";

export interface OperatorOverlayVersion {
  version_id: string;
  label: string;
  overlay_md: string;
  source: "manual" | "prompt_coach";
  chat_summary?: string | null;
  created_by: string;
  created_at: string;
}

export interface OperatorOverlayPointer {
  active_version_id: string | null;
  scheduled?: { version_id: string; start: string; end: string }[];
  updated_at?: string;
  updated_by?: string;
}

/** Watches the pointer doc + the currently-active version. */
export function useActiveOperatorOverlay() {
  const [pointer, setPointer] = useState<OperatorOverlayPointer | null>(null);
  const [active, setActive] = useState<OperatorOverlayVersion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "prompt_config", "operator_overlay");
    const unsub = onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        setPointer(null);
        setActive(null);
        setLoading(false);
        return;
      }
      const p = snap.data() as OperatorOverlayPointer;
      setPointer(p);
      const versionId = resolveActiveVersionId(p);
      if (!versionId) {
        setActive(null);
        setLoading(false);
        return;
      }
      const verSnap = await getDoc(
        doc(db, "prompt_config", "operator_overlay", "versions", versionId)
      );
      setActive(verSnap.exists() ? (verSnap.data() as OperatorOverlayVersion) : null);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { pointer, active, loading };
}

/** Reads the full versions history, newest first. */
export function useOperatorOverlayVersions() {
  return useQuery<OperatorOverlayVersion[]>({
    queryKey: ["operator-overlay", "versions"],
    queryFn: async () => {
      const ref = collection(db, "prompt_config", "operator_overlay", "versions");
      const q = query(ref, orderBy("created_at", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as OperatorOverlayVersion);
    },
  });
}

function resolveActiveVersionId(p: OperatorOverlayPointer): string | null {
  const today = new Date().toISOString().slice(0, 10);
  for (const entry of p.scheduled ?? []) {
    const startOk = !entry.start || entry.start <= today;
    const endOk = !entry.end || entry.end >= today;
    if (startOk && endOk) return entry.version_id;
  }
  return p.active_version_id ?? null;
}

export function useSaveOperatorOverlay() {
  const qc = useQueryClient();
  const fn = httpsCallable<
    { label: string; overlay_md: string; source?: "manual" | "prompt_coach"; chat_summary?: string },
    { status: string; version_id: string }
  >(functions, "saveOperatorOverlay");
  return useMutation({
    mutationFn: async (input: { label: string; overlay_md: string; source?: "manual" | "prompt_coach"; chat_summary?: string }) => {
      const res = await fn(input);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operator-overlay"] });
    },
  });
}

export function useSetOperatorOverlay() {
  const qc = useQueryClient();
  const fn = httpsCallable<
    { version_id: string; schedule?: { start: string; end: string } },
    { status: string; version_id: string }
  >(functions, "setOperatorOverlay");
  return useMutation({
    mutationFn: async (input: { version_id: string; schedule?: { start: string; end: string } }) => {
      const res = await fn(input);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operator-overlay"] });
    },
  });
}

export function useUpdateOperatorOverlayVersion() {
  const qc = useQueryClient();
  const fn = httpsCallable<
    { version_id: string; label?: string; overlay_md?: string },
    { status: string; version_id: string }
  >(functions, "updateOperatorOverlayVersion");
  return useMutation({
    mutationFn: async (input: { version_id: string; label?: string; overlay_md?: string }) =>
      (await fn(input)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operator-overlay"] });
    },
  });
}

export function useClearOperatorOverlay() {
  const qc = useQueryClient();
  const fn = httpsCallable<Record<string, never>, { status: string; noop?: boolean }>(
    functions,
    "clearOperatorOverlay",
  );
  return useMutation({
    mutationFn: async () => (await fn({})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operator-overlay"] });
    },
  });
}

export interface SimulateDraftResult {
  subject: string;
  content: string;
  used_overlay: boolean;
}

export function useSimulateDraft() {
  const fn = httpsCallable<
    { lead_id: string; overlay_md: string; provider?: "claude" | "gemini"; prompt_version?: "v17" },
    SimulateDraftResult
  >(functions, "simulateDraft");
  return useMutation({
    mutationFn: async (input: { lead_id: string; overlay_md: string; provider?: "claude" | "gemini"; prompt_version?: "v17" }) => {
      const res = await fn(input);
      return res.data;
    },
  });
}
