"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export interface CoachEnvelope {
  reply: string;
  proposed_overlay_md: string | null;
  action: "chat_only" | "propose" | "simulate" | "apply" | "save_and_schedule" | "escalate";
  foundational: boolean;
  escalation_payload: {
    request: string;
    agent_reason: string;
    proposed_edit: string;
    target_layer: "base" | "synthesized_rules";
  } | null;
}

export interface CoachTurn {
  role: "user" | "assistant";
  content: string; // raw text shown in the bubble
  envelope?: CoachEnvelope; // attached to assistant turns so actions are reachable
}

/**
 * Per-browser-session chat state. Marlow doesn't persist anything; the
 * conversation lives only as long as this React tree is mounted. Saved
 * overlays + change requests ARE the persistent memory.
 */
export function useCoachChat() {
  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [pending, setPending] = useState(false);

  const fn = httpsCallable<
    { message: string; history?: { role: string; content: string }[] },
    { envelope: CoachEnvelope }
  >(functions, "coachPromptChat");

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    setTurns((prev) => [...prev, { role: "user", content: trimmed }]);
    setPending(true);
    try {
      const history = turns.map((t) => ({ role: t.role, content: t.content }));
      const res = await fn({ message: trimmed, history });
      const envelope = res.data.envelope;
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

  function reset() {
    setTurns([]);
  }

  return { turns, send, pending, reset };
}
