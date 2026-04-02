"use client";

import { useEffect, useRef, useState } from "react";
import { X, Mail, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OutreachMessage } from "@/lib/types";

interface Props {
  message: OutreachMessage;
  onSave: (content: string, subject?: string) => void;
  onClose: () => void;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function EditMessageDialog({ message, onSave, onClose }: Props) {
  const [content, setContent] = useState(message.content);
  const [subject, setSubject] = useState(message.subject ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const isEmail = message.channel === "email";
  const words = wordCount(content);
  const targetMin = isEmail ? 60 : 20;
  const targetMax = isEmail ? 160 : 80;
  const wordCountColor =
    words < targetMin || words > targetMax
      ? "text-amber-500"
      : "text-emerald-500";

  function handleSave() {
    onSave(content, isEmail ? subject : undefined);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-2xl rounded-lg border border-border/50 bg-card shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="border-b border-border/50 px-6 py-4">
          <h2 className="text-lg font-semibold">{message.business_name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              {isEmail ? (
                <Mail className="h-3 w-3" />
              ) : (
                <MessageCircle className="h-3 w-3" />
              )}
              {isEmail ? "Email" : "DM"}
            </Badge>
            {message.venue_category && (
              <Badge variant="secondary" className="capitalize">
                {message.venue_category.replace(/_/g, " ")}
              </Badge>
            )}
            {message.step_number > 1 && (
              <Badge variant="secondary" className="text-xs">
                Step {message.step_number}
              </Badge>
            )}
            {message.tone_tier && (
              <Badge variant="outline" className="capitalize text-xs">
                {message.tone_tier.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          {/* Subject (email only) */}
          {isEmail && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Subject
              </label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          )}

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">
                Message
              </label>
              <span className={`text-xs font-medium ${wordCountColor}`}>
                {words} words (target: {targetMin}-{targetMax})
              </span>
            </div>
            <textarea
              ref={textareaRef}
              className="w-full min-h-[400px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save Edit
          </Button>
        </div>
      </div>
    </div>
  );
}
