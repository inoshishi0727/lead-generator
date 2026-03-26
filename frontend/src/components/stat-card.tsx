"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string | number;
  className?: string;
}

export function StatCard({ icon: Icon, label, value, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4",
        className
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
