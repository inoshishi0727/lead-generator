"use client";

/**
 * TagInput — reusable smart-suggest chip input for canonical tags.
 *
 * Selected tags render as amber chips with an inline remove button. The text
 * field normalizes input on the fly (showing the canonical preview) and surfaces
 * up to 6 near-match / exact suggestions sourced from `knownTags`. Enter accepts
 * the highlighted suggestion (or the normalized fresh tag); ArrowUp/Down moves
 * the highlight; Escape clears the suggestion popover.
 *
 * Pure presentational — the consumer owns `value` and supplies `knownTags`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeTag, suggestTags } from "@/lib/tag-utils";

const MAX_SUGGESTIONS = 6;

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  knownTags?: string[];
  placeholder?: string;
  disabled?: boolean;
}

interface Suggestion {
  tag: string;
  kind: "existing" | "near";
}

export function TagInput({
  value,
  onChange,
  knownTags = [],
  placeholder = "Add tag…",
  disabled = false,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalized = useMemo(() => normalizeTag(input), [input]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!normalized) return [];
    const raw = suggestTags(input, knownTags);
    return raw.slice(0, MAX_SUGGESTIONS).map<Suggestion>((tag) => ({
      tag,
      kind: tag === normalized ? "existing" : "near",
    }));
  }, [input, normalized, knownTags]);

  useEffect(() => {
    setHighlighted(0);
  }, [suggestions.length]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function addTag(raw: string) {
    const canonical = normalizeTag(raw);
    if (!canonical) return;
    if (value.includes(canonical)) {
      setInput("");
      setOpen(false);
      return;
    }
    onChange([...value, canonical]);
    setInput("");
    setOpen(false);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0 && highlighted >= 0 && highlighted < suggestions.length) {
        addTag(suggestions[highlighted].tag);
      } else if (normalized) {
        addTag(normalized);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Backspace" && input.length === 0 && value.length > 0) {
      e.preventDefault();
      removeTag(value[value.length - 1]);
      return;
    }
  }

  const showPreview = normalized.length > 0 && normalized !== input.trim().toLowerCase();
  const hasExactMatch = suggestions.some((s) => s.kind === "existing");
  const showCreateHint =
    normalized.length > 0 && !hasExactMatch && !value.includes(normalized);

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 transition-colors",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {value.map((tag) => (
          <Badge
            key={tag}
            className="border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/15"
          >
            <span>{tag}</span>
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => removeTag(tag)}
              className="-mr-0.5 ml-0.5 inline-flex items-center justify-center rounded-full text-amber-300/70 hover:text-amber-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300"
              tabIndex={-1}
            >
              <X size={12} />
            </button>
          </Badge>
        ))}
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled}
          className="h-6 min-w-[8ch] flex-1 border-0 bg-transparent px-1 py-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>

      {showPreview && (
        <div className="mt-1 text-xs text-muted-foreground">
          → <span className="font-mono text-foreground/80">{normalized}</span>
        </div>
      )}

      {open && (suggestions.length > 0 || showCreateHint) && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md"
        >
          {suggestions.map((s, i) => (
            <button
              type="button"
              role="option"
              aria-selected={i === highlighted}
              key={s.tag}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => addTag(s.tag)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                i === highlighted ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              {s.kind === "near" && (
                <span className="text-xs text-muted-foreground">did you mean</span>
              )}
              <span
                className={cn(
                  "font-mono",
                  s.kind === "existing" ? "text-foreground" : "text-amber-300",
                )}
              >
                {s.tag}
              </span>
            </button>
          ))}

          {showCreateHint && (
            <button
              type="button"
              role="option"
              aria-selected={suggestions.length === 0 && highlighted === 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(normalized)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                suggestions.length === 0 ? "hover:bg-muted/60" : "border-t border-border/60 mt-1 pt-2",
              )}
            >
              <span className="text-xs text-muted-foreground">Create</span>
              <span className="font-mono text-foreground">{normalized}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
