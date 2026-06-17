"use client";

/**
 * AutocompleteInput — reusable search input with suggestion popover.
 *
 * Pure presentational. Caller owns the value, the suggestion list, and the
 * onSelect handler. Keyboard: ArrowDown / ArrowUp navigate, Enter selects the
 * highlighted suggestion (falls back to caller's onSubmit if nothing is
 * highlighted), Escape closes the popover.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Suggestion {
  id: string;
  label: string;
  sublabel?: string;
  /** Optional right-aligned chip (category, tag, etc). */
  meta?: string;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  suggestions: Suggestion[];
  onSelect: (suggestion: Suggestion) => void;
  /** Called when Enter is pressed and no suggestion is highlighted (e.g. submit full-text search). */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Max suggestions to render. Default 8. */
  maxSuggestions?: number;
  /** Forward ref to the underlying input. */
  inputRef?: React.Ref<HTMLInputElement>;
}

export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  onSelect,
  onSubmit,
  placeholder = "Search…",
  className,
  icon,
  disabled = false,
  maxSuggestions = 8,
  inputRef,
}: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => suggestions.slice(0, maxSuggestions), [suggestions, maxSuggestions]);

  useEffect(() => {
    setHighlighted(0);
  }, [visible.length]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function handleSelect(s: Suggestion) {
    onSelect(s);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      if (visible.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h + 1) % visible.length);
      return;
    }
    if (e.key === "ArrowUp") {
      if (visible.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => (h - 1 + visible.length) % visible.length);
      return;
    }
    if (e.key === "Enter") {
      if (open && visible.length > 0 && highlighted >= 0 && highlighted < visible.length) {
        e.preventDefault();
        handleSelect(visible[highlighted]);
        return;
      }
      if (onSubmit && value.trim()) {
        e.preventDefault();
        onSubmit(value.trim());
        setOpen(false);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
  }

  const showPopover = open && value.trim().length > 0 && visible.length > 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        {icon ?? <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />}
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9"
        />
      </div>

      {showPopover && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-md"
        >
          {visible.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(s)}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
                i === highlighted ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{s.label}</div>
                {s.sublabel && (
                  <div className="truncate text-xs text-muted-foreground">{s.sublabel}</div>
                )}
              </div>
              {s.meta && (
                <span className="shrink-0 text-[10px] text-muted-foreground capitalize">{s.meta}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
