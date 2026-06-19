"use client";

/**
 * AutoTagChips — renders system-managed lead.auto_tags as distinct chips.
 *
 * Visually separated from manual tags (outline style + bot icon) so operators
 * can tell at a glance which tags the funnel applied automatically. Engagement
 * tags get colour accents; `revisit:YYYY-MM` renders with a calendar hint.
 */

import { Bot, CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ACCENTS: Record<string, string> = {
  hot: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  warm: "border-orange-400/40 bg-orange-400/10 text-orange-300",
  not_interested: "border-slate-400/40 bg-slate-400/10 text-slate-300",
  engaged_no_reply: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  ghosted: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
};

function labelFor(tag: string): string {
  if (tag.startsWith("revisit:")) return `revisit ${tag.slice("revisit:".length)}`;
  return tag.replace(/_/g, " ");
}

export function AutoTagChips({
  tags,
  className,
  onTagClick,
}: {
  tags: string[];
  className?: string;
  onTagClick?: (tag: string) => void;
}) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.map((tag) => {
        const isRevisit = tag.startsWith("revisit:");
        const accent = isRevisit
          ? "border-violet-400/40 bg-violet-400/10 text-violet-300"
          : ACCENTS[tag] ?? "border-border bg-muted/40 text-muted-foreground";
        return (
          <Badge
            key={tag}
            variant="outline"
            onClick={onTagClick ? (e) => { e.stopPropagation(); onTagClick(tag); } : undefined}
            className={cn("gap-1 font-normal", accent, onTagClick && "cursor-pointer")}
          >
            {isRevisit ? <CalendarClock size={11} /> : <Bot size={11} />}
            <span>{labelFor(tag)}</span>
          </Badge>
        );
      })}
    </div>
  );
}
