"use client";

import { useCallback, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export type CoachAction =
  | "chat_only"
  | "propose"
  | "simulate"
  | "apply"
  | "save_and_schedule"
  | "escalate"
  | "update_lead"
  | "search_leads"
  | "snooze_lead"
  | "bulk_tag";

export interface CoachPlan {
  summary: string;
  target_count?: number;
  target_ids?: string[];
  fields?: Record<string, unknown>;
  tag?: string;
  filter?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

export interface CoachEnvelope {
  reply: string;
  proposed_overlay_md: string | null;
  action: CoachAction;
  foundational: boolean;
  escalation_payload: {
    request: string;
    agent_reason: string;
    proposed_edit: string;
    target_layer: "base" | "synthesized_rules";
  } | null;
  plan?: CoachPlan;
}

export interface CoachTurn {
  role: "user" | "assistant";
  content: string;
  envelope?: CoachEnvelope;
}

export interface MarlowConversationSummary {
  id: string;
  title: string;
  last_turn_at: string | null;
  created_at: string | null;
  turn_count: number;
  first_message: string;
  search_text: string;
  archived: boolean;
}

interface ChatResult {
  envelope: CoachEnvelope;
  conversation_id: string;
}

interface LoadResult {
  conversation: {
    id: string;
    title: string;
    created_at: string | null;
    last_turn_at: string | null;
    turn_count: number;
    archived: boolean;
  };
  turns: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    envelope: CoachEnvelope | null;
    created_at: string | null;
    index: number;
  }>;
}

export function useCoachChat() {
  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [loadingConvo, setLoadingConvo] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);

  const chatFn = useMemo(
    () =>
      httpsCallable<
        {
          message: string;
          history?: { role: string; content: string }[];
          conversation_id?: string;
        },
        ChatResult
      >(functions, "coachPromptChat"),
    [],
  );

  const loadFn = useMemo(
    () =>
      httpsCallable<{ conversation_id: string }, LoadResult>(
        functions,
        "getMarlowConversation",
      ),
    [],
  );

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    setTurns((prev) => [...prev, { role: "user", content: trimmed }]);
    setPending(true);
    try {
      const history = turns.map((t) => ({ role: t.role, content: t.content }));
      const res = await chatFn({
        message: trimmed,
        history,
        conversation_id: conversationId ?? undefined,
      });
      const envelope = res.data.envelope;
      const returnedId = res.data.conversation_id;
      if (returnedId && returnedId !== conversationId) {
        setConversationId(returnedId);
      }
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: envelope.reply, envelope },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Marlow had trouble.";
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: `(Marlow had trouble: ${msg})` },
      ]);
    } finally {
      setPending(false);
    }
  }

  function newChat() {
    setTurns([]);
    setConversationId(null);
    setActiveTitle(null);
  }

  const loadConversation = useCallback(
    async (id: string) => {
      setTurns([]);
      setLoadingConvo(true);
      try {
        const res = await loadFn({ conversation_id: id });
        const loadedTurns: CoachTurn[] = res.data.turns.map((t) => ({
          role: t.role,
          content: t.content,
          envelope: t.envelope ?? undefined,
        }));
        setTurns(loadedTurns);
        setConversationId(res.data.conversation.id);
        setActiveTitle(res.data.conversation.title);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Couldn't load that conversation.";
        setTurns([
          { role: "assistant", content: `(Failed to load conversation: ${msg})` },
        ]);
      } finally {
        setLoadingConvo(false);
      }
    },
    [loadFn],
  );

  return {
    turns,
    send,
    pending,
    loadingConvo,
    newChat,
    conversationId,
    activeTitle,
    loadConversation,
  };
}

export function useMarlowConversations() {
  const [conversations, setConversations] = useState<MarlowConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const listFn = useMemo(
    () =>
      httpsCallable<
        { limit?: number; includeArchived?: boolean },
        { conversations: MarlowConversationSummary[] }
      >(functions, "listMarlowConversations"),
    [],
  );

  const updateFn = useMemo(
    () =>
      httpsCallable<
        { conversation_id: string; archived?: boolean; title?: string },
        { status: string }
      >(functions, "updateMarlowConversation"),
    [],
  );

  const deleteFn = useMemo(
    () =>
      httpsCallable<{ conversation_id: string }, { status: string }>(
        functions,
        "deleteMarlowConversation",
      ),
    [],
  );

  const refresh = useCallback(
    async (opts?: { includeArchived?: boolean }) => {
      const wantArchived = opts?.includeArchived ?? includeArchived;
      setLoading(true);
      try {
        const res = await listFn({ limit: 50, includeArchived: wantArchived });
        setConversations(res.data.conversations || []);
      } catch (err) {
        console.warn("listMarlowConversations failed:", err);
      } finally {
        setLoading(false);
      }
    },
    [listFn, includeArchived],
  );

  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      await updateFn({ conversation_id: id, archived });
      await refresh();
    },
    [updateFn, refresh],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      await updateFn({ conversation_id: id, title });
      await refresh();
    },
    [updateFn, refresh],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      await deleteFn({ conversation_id: id });
      await refresh();
    },
    [deleteFn, refresh],
  );

  return {
    conversations,
    loading,
    refresh,
    setArchived,
    rename,
    deleteConversation,
    includeArchived,
    setIncludeArchived,
  };
}
