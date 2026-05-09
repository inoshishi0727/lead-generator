"use client";

import { useOpenRateByStep } from "@/hooks/use-analytics";

export function OpenRateByStepChart() {
  const { data, isLoading } = useOpenRateByStep();
  const points = data?.points ?? [];

  const maxOpenRate = Math.max(20, ...points.map((p) => p.open_rate));

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Open Rate by Message Position</h3>
        <span className="text-[11px] text-muted-foreground">Initial vs follow-ups</span>
      </div>

      {isLoading && <p className="py-6 text-center text-xs text-muted-foreground">Loading…</p>}

      {!isLoading && points.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No sent messages yet.
        </p>
      )}

      {!isLoading && points.length > 0 && (
        <div className="space-y-2">
          {points.map((p) => (
            <div key={p.step_number} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground">{p.label}</span>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-zinc-900/40">
                <div
                  className="h-full border-r border-emerald-500 bg-emerald-500/30"
                  style={{ width: `${(p.open_rate / maxOpenRate) * 100}%` }}
                />
              </div>
              <span className="w-14 text-right tabular-nums">{p.open_rate.toFixed(1)}%</span>
              <span className="w-24 text-right tabular-nums text-muted-foreground">
                {p.opened}/{p.sent}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
