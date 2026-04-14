"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSaveReflection, useClearReflection } from "@/hooks/use-edit-reflections";
import type { EditFeedback } from "@/lib/types";

interface Props {
  feedback: EditFeedback;
  onReflected?: () => void;
}

export function ReflectionCard({ feedback, onReflected }: Props) {
  const [note, setNote] = useState(feedback.reflection_note ?? "");
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(!!feedback.reflected_at);
  const saveMutation = useSaveReflection();
  const clearMutation = useClearReflection();

  function handleSave() {
    if (!note.trim()) return;
    saveMutation.mutate(
      { feedbackId: feedback.id, category: "other", note: note.trim() },
      {
        onSuccess: () => {
          setSaved(true);
          onReflected?.();
        },
      }
    );
  }

  function handleUndo() {
    clearMutation.mutate(feedback.id, {
      onSuccess: () => {
        setSaved(false);
        setNote("");
      },
    });
  }

  const truncateLen = 150;
  const originalShort = feedback.original_content.length > truncateLen
    ? feedback.original_content.slice(0, truncateLen) + "..."
    : feedback.original_content;
  const editedShort = feedback.edited_content.length > truncateLen
    ? feedback.edited_content.slice(0, truncateLen) + "..."
    : feedback.edited_content;
  const needsExpand = feedback.original_content.length > truncateLen || feedback.edited_content.length > truncateLen;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${saved ? "border-emerald-500/30 bg-emerald-950/5" : "border-border/50"}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {feedback.venue_category && (
            <Badge variant="secondary" className="capitalize text-xs">
              {feedback.venue_category.replace(/_/g, " ")}
            </Badge>
          )}
          {feedback.tone_tier && (
            <Badge variant="outline" className="capitalize text-xs">
              {feedback.tone_tier.replace(/_/g, " ")}
            </Badge>
          )}
          {feedback.step_number && feedback.step_number > 1 && (
            <Badge variant="secondary" className="text-xs">
              Step {feedback.step_number}
            </Badge>
          )}
        </div>
        {saved && (
          <button
            onClick={handleUndo}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span className="text-xs">Undo</span>
          </button>
        )}
      </div>

      {/* Subject diff (if changed) */}
      {feedback.original_subject && feedback.edited_subject && feedback.original_subject !== feedback.edited_subject && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-muted-foreground font-medium">Original subject:</span>
            <p className="text-muted-foreground/70 mt-0.5">{feedback.original_subject}</p>
          </div>
          <div>
            <span className="font-medium">Edited subject:</span>
            <p className="mt-0.5">{feedback.edited_subject}</p>
          </div>
        </div>
      )}

      {/* Content diff */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-xs font-medium text-muted-foreground">Original</span>
          <div className="mt-1 rounded bg-muted/30 p-2.5 text-xs leading-relaxed text-muted-foreground/70 whitespace-pre-wrap">
            {expanded ? feedback.original_content : originalShort}
          </div>
        </div>
        <div>
          <span className="text-xs font-medium">Edited</span>
          <div className="mt-1 rounded bg-muted/30 p-2.5 text-xs leading-relaxed whitespace-pre-wrap">
            {expanded ? feedback.edited_content : editedShort}
          </div>
        </div>
      </div>

      {needsExpand && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Show less" : "Show full text"}
        </button>
      )}

      {/* Reflection text box */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Why did you edit this?</span>
        <textarea
          placeholder="e.g. 'Too formal for a cocktail bar, needed to mention their signature negroni, and the opening line felt generic'"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saved}
          rows={3}
          className="mt-1.5 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {!saved && (
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={!note.trim() || saveMutation.isPending}
            >
              <Check className="mr-1 h-3 w-3" />
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
