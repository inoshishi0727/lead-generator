"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSaveReflection, useClearReflection } from "@/hooks/use-edit-reflections";
import type { EditFeedback, ReflectionCategory } from "@/lib/types";

const CATEGORIES: { value: ReflectionCategory; label: string }[] = [
  { value: "tone", label: "Tone" },
  { value: "product_focus", label: "Product Focus" },
  { value: "length", label: "Length" },
  { value: "personalization", label: "Personalization" },
  { value: "factual_error", label: "Factual Error" },
  { value: "structure", label: "Structure" },
  { value: "other", label: "Other" },
];

interface Props {
  feedback: EditFeedback;
  onReflected?: () => void;
}

export function ReflectionCard({ feedback, onReflected }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<ReflectionCategory | null>(
    feedback.reflection_category
  );
  const [note, setNote] = useState(feedback.reflection_note ?? "");
  const [expanded, setExpanded] = useState(false);
  const saveMutation = useSaveReflection();
  const clearMutation = useClearReflection();
  const isReflected = !!feedback.reflected_at;

  function handleSelectCategory(cat: ReflectionCategory) {
    setSelectedCategory(cat);
    saveMutation.mutate(
      { feedbackId: feedback.id, category: cat, note: note || null },
      { onSuccess: () => onReflected?.() }
    );
  }

  function handleNoteBlur() {
    if (selectedCategory && note !== (feedback.reflection_note ?? "")) {
      saveMutation.mutate({
        feedbackId: feedback.id,
        category: selectedCategory,
        note: note || null,
      });
    }
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
    <div className={`rounded-lg border p-4 space-y-3 ${isReflected && !selectedCategory ? "opacity-60" : ""} ${selectedCategory ? "border-emerald-500/30 bg-emerald-950/5" : "border-border/50"}`}>
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
        {selectedCategory && (
          <button
            onClick={() => {
              clearMutation.mutate(feedback.id, {
                onSuccess: () => {
                  setSelectedCategory(null);
                  setNote("");
                },
              });
            }}
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

      {/* Category pills */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Why did you edit this?</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => handleSelectCategory(cat.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedCategory === cat.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Note text box */}
      {selectedCategory && (
        <textarea
          placeholder="Brief note (optional) — e.g. 'too formal for a cocktail bar'"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={handleNoteBlur}
          rows={3}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )}
    </div>
  );
}
