"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReflectionCard } from "@/components/reflection-card";
import { useWeeklyEdits } from "@/hooks/use-edit-reflections";

interface Props {
  onClose: () => void;
}

export function EditReflectionDialog({ onClose }: Props) {
  const { data: edits, isLoading } = useWeeklyEdits();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const unreflected = (edits ?? []).filter((e) => !e.reflected_at);
  const reflected = (edits ?? []).filter((e) => !!e.reflected_at);
  const total = (edits ?? []).length;
  const reviewedCount = reflected.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[5vh] backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-3xl rounded-lg border border-border/50 bg-card shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="border-b border-border/50 px-6 py-4">
          <h2 className="text-lg font-semibold">Weekly Edit Review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tag each edit with a reason so Claude learns <em>why</em> you changed it, not just what changed.
          </p>
          {total > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${total > 0 ? (reviewedCount / total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {reviewedCount}/{total} reviewed
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">Loading edits...</p>
          )}

          {!isLoading && total === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No edits this week. When you edit drafts, they will appear here for review.
            </p>
          )}

          {unreflected.map((fb) => (
            <ReflectionCard key={fb.id} feedback={fb} />
          ))}

          {reflected.length > 0 && unreflected.length > 0 && (
            <div className="flex items-center gap-3 py-2">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-xs text-muted-foreground">Already reviewed</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
          )}

          {reflected.map((fb) => (
            <ReflectionCard key={fb.id} feedback={fb} />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border/50 px-6 py-4">
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
