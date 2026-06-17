"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { functions } from "@/lib/firebase";
import type { CoachEnvelope, CoachPlan } from "@/hooks/use-coach-chat";

export interface MarlowActionCallbacks {
  onProposeOverlay?: (overlayMd: string) => void;
  onApplyOverlay?: (overlayMd: string) => void;
  onSaveAndSchedule?: (overlayMd: string) => void;
  onEscalate?: (escalation: NonNullable<CoachEnvelope["escalation_payload"]>) => void;
  onSimulate?: (overlayMd: string) => void;
}

interface Props extends MarlowActionCallbacks {
  envelope: CoachEnvelope;
}

interface SearchResult {
  id: string;
  name?: string;
  venue_name?: string;
  city?: string;
  stage?: string;
}

// types align after backend merge
type ExecuteResponse = {
  ok?: boolean;
  message?: string;
  results?: SearchResult[];
};

function planTargetCount(plan?: CoachPlan): number | undefined {
  if (!plan) return undefined;
  if (typeof plan.target_count === "number") return plan.target_count;
  if (Array.isArray(plan.target_ids)) return plan.target_ids.length;
  return undefined;
}

export function MarlowActionButtons({
  envelope,
  onProposeOverlay,
  onApplyOverlay,
  onSaveAndSchedule,
  onEscalate,
  onSimulate,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [executed, setExecuted] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);

  const { action, plan } = envelope;

  useEffect(() => {
    if (action !== "search_leads" || executed || dismissed) return;
    let cancelled = false;
    (async () => {
      setRunning(true);
      try {
        const fn = httpsCallable<
          { action: string; plan?: CoachPlan },
          ExecuteResponse
        >(functions, "executeMarlowAction");
        const res = await fn({ action, plan });
        if (cancelled) return;
        setResults(res.data?.results ?? []);
        setExecuted(true);
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : "Search failed.");
        setExecuted(true);
      } finally {
        if (!cancelled) setRunning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [action, plan, executed, dismissed]);

  if (dismissed) return null;
  if (action === "chat_only") return null;

  async function runCallable() {
    setRunning(true);
    try {
      const fn = httpsCallable<
        { action: string; plan?: CoachPlan },
        ExecuteResponse
      >(functions, "executeMarlowAction");
      const res = await fn({ action, plan });
      toast.success(res.data?.message ?? "Done.");
      setExecuted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setRunning(false);
    }
  }

  function dismiss() {
    setDismissed(true);
    toast("Cancelled. Marlow can suggest something else.");
  }

  if (action === "search_leads") {
    return (
      <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 dark:border-amber-500/20 dark:bg-amber-500/[0.04]">
        {plan?.summary && (
          <p className="mb-2 text-xs text-foreground/90">{plan.summary}</p>
        )}
        {running && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            Searching…
          </div>
        )}
        {!running && results && results.length === 0 && (
          <p className="text-xs italic text-muted-foreground">No leads matched.</p>
        )}
        {!running && results && results.length > 0 && (
          <ul className="space-y-1 text-xs">
            {results.slice(0, 12).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded border border-border/40 bg-background/40 px-2 py-1"
              >
                <span className="truncate">
                  {r.name ?? r.venue_name ?? r.id}
                  {r.city ? (
                    <span className="ml-1 text-muted-foreground">· {r.city}</span>
                  ) : null}
                </span>
                {r.stage && (
                  <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.stage}
                  </span>
                )}
              </li>
            ))}
            {results.length > 12 && (
              <li className="text-[11px] italic text-muted-foreground">
                …and {results.length - 12} more
              </li>
            )}
          </ul>
        )}
      </div>
    );
  }

  if (executed) return null;

  const overlayMd = envelope.proposed_overlay_md ?? "";
  const buttons: Array<{
    label: string;
    onClick: () => void;
    tone: "primary" | "outline" | "soft" | "danger";
  }> = [];

  switch (action) {
    case "propose":
      if (overlayMd && onProposeOverlay) {
        buttons.push({
          label: "Activate overlay",
          onClick: () => {
            onProposeOverlay(overlayMd);
            setExecuted(true);
          },
          tone: "primary",
        });
      }
      if (overlayMd && onProposeOverlay) {
        buttons.push({
          label: "Save overlay",
          onClick: () => {
            onProposeOverlay(overlayMd);
            toast.success("Loaded into editor. Hit Save only to store.");
            setExecuted(true);
          },
          tone: "outline",
        });
      }
      if (overlayMd && onSimulate) {
        buttons.push({
          label: "Simulate first",
          onClick: () => {
            onSimulate(overlayMd);
            setExecuted(true);
          },
          tone: "soft",
        });
      }
      break;
    case "simulate":
      if (overlayMd && onSimulate) {
        buttons.push({
          label: "Run simulation",
          onClick: () => {
            onSimulate(overlayMd);
            setExecuted(true);
          },
          tone: "primary",
        });
      }
      break;
    case "apply":
      if (overlayMd && onApplyOverlay) {
        buttons.push({
          label: "Apply",
          onClick: () => {
            onApplyOverlay(overlayMd);
            setExecuted(true);
          },
          tone: "primary",
        });
      }
      break;
    case "save_and_schedule":
      if (overlayMd && onSaveAndSchedule) {
        buttons.push({
          label: "Save & schedule",
          onClick: () => {
            onSaveAndSchedule(overlayMd);
            setExecuted(true);
          },
          tone: "primary",
        });
      }
      break;
    case "escalate":
      if (envelope.escalation_payload && onEscalate) {
        buttons.push({
          label: "Escalate to founder",
          onClick: () => {
            onEscalate(envelope.escalation_payload!);
            setExecuted(true);
          },
          tone: "danger",
        });
      }
      break;
    case "update_lead":
      buttons.push({
        label: "Execute change",
        onClick: runCallable,
        tone: "primary",
      });
      break;
    case "snooze_lead":
      buttons.push({
        label: "Snooze",
        onClick: runCallable,
        tone: "primary",
      });
      break;
    case "bulk_tag": {
      const n = planTargetCount(plan);
      buttons.push({
        label: n !== undefined ? `Tag ${n} leads` : "Tag leads",
        onClick: runCallable,
        tone: "primary",
      });
      break;
    }
  }

  if (buttons.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 dark:border-amber-500/20 dark:bg-amber-500/[0.04]">
      {plan?.summary && (
        <p className="mb-2 text-xs text-foreground/90">{plan.summary}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            disabled={running}
            onClick={b.onClick}
            className={toneClass(b.tone)}
          >
            {running && <Loader2 size={11} className="mr-1 inline animate-spin" />}
            {b.label}
          </button>
        ))}
        <button
          type="button"
          disabled={running}
          onClick={dismiss}
          className="rounded-md border border-border/60 bg-transparent px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
        >
          Don&apos;t proceed
        </button>
      </div>
    </div>
  );
}

function toneClass(tone: "primary" | "outline" | "soft" | "danger") {
  const base =
    "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50";
  switch (tone) {
    case "primary":
      return `${base} bg-amber-500 text-white hover:bg-amber-600`;
    case "outline":
      return `${base} border border-input bg-background hover:bg-accent`;
    case "soft":
      return `${base} border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20`;
    case "danger":
      return `${base} border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20`;
  }
}
