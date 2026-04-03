"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OutreachMessage } from "@/lib/types";

interface Props {
  message: OutreachMessage;
  flowingDraft: { subject: string | null; content: string };
  onPickOriginal: () => void;
  onPickFlowing: () => void;
  onClose: () => void;
}

export function RegenerateCompareDialog({
  message,
  flowingDraft,
  onPickOriginal,
  onPickFlowing,
  onClose,
}: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const isEmail = message.channel === "email";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[6vh] backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-4xl rounded-lg border border-border/50 bg-card shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="border-b border-border/50 px-6 py-4">
          <h2 className="text-lg font-semibold">Compare Versions</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {message.business_name} — choose which version to keep
          </p>
        </div>

        {/* Side-by-side panels */}
        <div className="grid grid-cols-2 divide-x divide-border/50 px-0">
          {/* Original */}
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Original
              </span>
            </div>
            {isEmail && message.subject && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Subject</p>
                <p className="text-sm font-medium">{message.subject}</p>
              </div>
            )}
            <div>
              {isEmail && <p className="text-xs text-muted-foreground mb-1">Body</p>}
              <div className="min-h-[300px] max-h-[420px] overflow-y-auto rounded-md border border-input bg-muted/30 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </div>
            </div>
          </div>

          {/* Flowing draft */}
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Flowing Style
              </span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-500">
                new
              </span>
            </div>
            {isEmail && flowingDraft.subject && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Subject</p>
                <p className="text-sm font-medium">{flowingDraft.subject}</p>
              </div>
            )}
            <div>
              {isEmail && <p className="text-xs text-muted-foreground mb-1">Body</p>}
              <div className="min-h-[300px] max-h-[420px] overflow-y-auto rounded-md border border-input bg-muted/30 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {flowingDraft.content}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onPickOriginal}>
            Keep Original
          </Button>
          <Button size="sm" onClick={onPickFlowing}>
            Use Flowing
          </Button>
        </div>
      </div>
    </div>
  );
}
