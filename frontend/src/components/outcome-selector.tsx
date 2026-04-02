"use client";

import { useUpdateLeadOutcome } from "@/hooks/use-outreach";
import type { LeadOutcome } from "@/lib/types";

interface Props {
  leadId: string;
  currentOutcome: LeadOutcome | null;
}

const OUTCOMES: { value: LeadOutcome; label: string; color: string }[] = [
  { value: "ongoing", label: "Ongoing", color: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700" },
  { value: "converted", label: "Converted", color: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700" },
  { value: "lost", label: "Lost", color: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700" },
  { value: "not_interested", label: "Not Interested", color: "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700" },
  { value: "snoozed", label: "Snoozed", color: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700" },
];

export function OutcomeSelector({ leadId, currentOutcome }: Props) {
  const outcomeMutation = useUpdateLeadOutcome();

  function handleSelect(outcome: LeadOutcome) {
    if (outcome === currentOutcome) return;
    outcomeMutation.mutate({ lead_id: leadId, outcome });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {OUTCOMES.map((o) => (
        <button
          key={o.value}
          onClick={() => handleSelect(o.value)}
          disabled={outcomeMutation.isPending}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
            currentOutcome === o.value
              ? `${o.color} ring-2 ring-offset-1 ring-current`
              : "border-border bg-muted/50 text-muted-foreground hover:bg-accent"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
