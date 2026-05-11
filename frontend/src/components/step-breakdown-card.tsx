"use client";

import { Eye, Reply, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStepBreakdown } from "@/hooks/use-analytics";

function RateBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
    </div>
  );
}

export function StepBreakdownCard() {
  const { data, isLoading } = useStepBreakdown();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Send className="h-4 w-4" /> Opens & Replies by Step
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const steps = data?.steps ?? [];

  if (steps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Send className="h-4 w-4" /> Opens & Replies by Step
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No sent emails yet.</p>
        </CardContent>
      </Card>
    );
  }

  const maxSent = Math.max(...steps.map((s) => s.sent), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Send className="h-4 w-4" /> Opens & Replies by Step
        </CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/40">
              <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[22%]">Step</th>
              <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[26%]">
                Sent
              </th>
              <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[26%]">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Opened</span>
              </th>
              <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[26%]">
                <span className="flex items-center gap-1"><Reply className="h-3 w-3" /> Replied</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {steps.map((s) => (
              <tr key={s.step} className="group">
                {/* Step name */}
                <td className="py-3 pr-4">
                  <p className="font-medium text-xs">{s.label}</p>
                </td>

                {/* Sent + volume bar */}
                <td className="py-3 pr-4">
                  <p className="tabular-nums font-semibold">{s.sent.toLocaleString()}</p>
                  <RateBar pct={(s.sent / maxSent) * 100} color="#6366f1" />
                </td>

                {/* Opened */}
                <td className="py-3 pr-4">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`tabular-nums font-semibold ${s.open_rate >= 30 ? "text-blue-400" : s.open_rate >= 15 ? "text-amber-400" : ""}`}>
                      {s.open_rate}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">{s.opened} opened</span>
                  </div>
                  <RateBar pct={s.open_rate} color="#3b82f6" />
                </td>

                {/* Replied */}
                <td className="py-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`tabular-nums font-semibold ${s.reply_rate >= 5 ? "text-emerald-400" : s.reply_rate >= 2 ? "text-amber-400" : ""}`}>
                      {s.reply_rate}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">{s.replied} replied</span>
                  </div>
                  <RateBar pct={s.reply_rate * 4} color="#059669" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-3 text-[10px] text-muted-foreground">
          Reply bar scaled ×4 for visibility. Open rate: blue ≥30% · amber ≥15%. Reply rate: green ≥5% · amber ≥2%.
        </p>
      </CardContent>
    </Card>
  );
}
