"use client";

import { useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, Loader2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDraftSuggestions, useApplyDraftSuggestions } from "@/hooks/use-draft-suggestions";
import type { DraftSuggestion } from "@/lib/types";
import { toast } from "sonner";

interface Props {
  messageId: string;
  onApply?: (subject: string, content: string) => void;
}

const CONFIDENCE_COLOR: Record<DraftSuggestion["confidence"], string> = {
  high: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

export function DraftCoachPanel({ messageId, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useDraftSuggestions(messageId, open);
  const applyMutation = useApplyDraftSuggestions();

  function handleApply() {
    if (!data?.suggestions.length || !onApply) return;
    applyMutation.mutate(
      {
        message_id: messageId,
        suggestions: data.suggestions.map((s) => ({
          title: s.title,
          concrete_change: s.concrete_change,
        })),
      },
      {
        onSuccess: (result) => {
          onApply(result.subject, result.content);
          toast.success("Suggestions applied — review and save");
        },
        onError: () => {
          toast.error("Couldn't apply suggestions. Try again.");
        },
      }
    );
  }

  return (
    <div className="rounded-md border border-border/50 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">AI Coach</span>
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/50 px-3 py-3 space-y-3">
          {isLoading && (
            <p className="text-xs text-muted-foreground">Analyzing draft against segment performance...</p>
          )}

          {isError && (
            <div className="space-y-2">
              <p className="text-xs text-destructive">Failed to load suggestions.</p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          {data && data.suggestions.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              {data.reason || "No suggestions available for this draft."}
            </p>
          )}

          {data && data.suggestions.length > 0 && onApply && (
            <Button
              size="sm"
              onClick={handleApply}
              disabled={applyMutation.isPending}
              className="w-full"
            >
              {applyMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {applyMutation.isPending ? "Applying..." : "Apply suggestions to draft"}
            </Button>
          )}

          {data && data.suggestions.length > 0 && (
            <ul className="space-y-2.5">
              {data.suggestions.map((s, i) => (
                <li key={i} className="rounded border border-border/50 bg-background p-2.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold">{s.title}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${CONFIDENCE_COLOR[s.confidence]}`}
                    >
                      {s.confidence}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1.5">{s.rationale}</p>
                  <p className="text-xs">{s.concrete_change}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
