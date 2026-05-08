"use client";

import { useEffect, useState } from "react";
import { DollarSign, MessageCircle, Zap, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/lib/auth-context";

interface DailyRow {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
  calls: number;
}

interface CostResponse {
  windowDays: number | null;
  all: boolean;
  since: string | null;
  pricing: {
    inputPerMTok: number;
    outputPerMTok: number;
    cacheWritePerMTok: number;
    cacheReadPerMTok: number;
  };
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    cost: number;
    calls: number;
    sessions: number;
    avgCostPerSession: number;
  };
  daily: DailyRow[];
}

type Window = 7 | 30 | 90 | "all";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

const fmtNum = (n: number) => n.toLocaleString("en-US");

export default function CostAnalyticsPage() {
  const { isAdmin } = useAuth();
  const [windowSel, setWindowSel] = useState<Window>(30);
  const [data, setData] = useState<CostResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const qs = windowSel === "all" ? "all=1" : `days=${windowSel}`;
    fetch(`/api/analytics/cost?${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) {
          setErr(j.error);
          setData(null);
        } else {
          setData(j);
        }
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [windowSel]);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const maxDailyCost = data?.daily.reduce((m, d) => Math.max(m, d.cost), 0) ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-emerald-500" />
        <h1 className="text-xl font-semibold">Jarvis AI Cost</h1>
        <span className="text-xs text-muted-foreground ml-2">
          Claude Haiku 4.5 token usage and spend.
        </span>
        <div className="ml-auto flex gap-1">
          {([7, 30, 90, "all"] as Window[]).map((n) => (
            <button
              key={String(n)}
              onClick={() => setWindowSel(n)}
              className={`text-xs px-3 py-1 rounded border ${
                windowSel === n
                  ? "border-amber-500 text-amber-500"
                  : "border-zinc-800 text-muted-foreground hover:text-foreground"
              }`}
            >
              {n === "all" ? "All time" : `${n}d`}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {err && <p className="text-sm text-red-500">{err}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={DollarSign}
              label={data.all ? "Total spend (all time)" : `Total spend (${data.windowDays}d)`}
              value={fmtUsd(data.totals.cost)}
            />
            <StatCard
              icon={MessageCircle}
              label="Sessions"
              value={fmtNum(data.totals.sessions)}
            />
            <StatCard
              icon={TrendingUp}
              label="Avg cost / session"
              value={fmtUsd(data.totals.avgCostPerSession)}
            />
            <StatCard
              icon={Zap}
              label="API calls"
              value={fmtNum(data.totals.calls)}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={Zap}
              label="Input tokens"
              value={fmtNum(data.totals.inputTokens)}
            />
            <StatCard
              icon={Zap}
              label="Output tokens"
              value={fmtNum(data.totals.outputTokens)}
            />
            <StatCard
              icon={Zap}
              label="Cache write tokens"
              value={fmtNum(data.totals.cacheCreationTokens)}
            />
            <StatCard
              icon={Zap}
              label="Cache read tokens"
              value={fmtNum(data.totals.cacheReadTokens)}
            />
          </div>

          <div className="border border-zinc-800 rounded-lg p-4">
            <h2 className="text-sm font-medium mb-3">
              Daily spend
              <span className="text-xs text-muted-foreground ml-2">
                {data.daily.length} day{data.daily.length === 1 ? "" : "s"} with activity
              </span>
            </h2>
            {data.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No usage recorded in this window.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.daily.map((d) => {
                  const pct = maxDailyCost > 0 ? (d.cost / maxDailyCost) * 100 : 0;
                  return (
                    <div key={d.date} className="flex items-center gap-3 text-xs">
                      <span className="w-24 text-muted-foreground tabular-nums">{d.date}</span>
                      <div className="flex-1 bg-zinc-900 rounded h-5 relative overflow-hidden">
                        <div
                          className="h-full bg-emerald-500/30 border-r border-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-20 text-right tabular-nums">{fmtUsd(d.cost)}</span>
                      <span className="w-16 text-right tabular-nums text-muted-foreground">
                        {d.calls} call{d.calls === 1 ? "" : "s"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground">
            Pricing — input: ${data.pricing.inputPerMTok.toFixed(2)}/MTok · output: $
            {data.pricing.outputPerMTok.toFixed(2)}/MTok · cache write: $
            {data.pricing.cacheWritePerMTok.toFixed(2)}/MTok · cache read: $
            {data.pricing.cacheReadPerMTok.toFixed(2)}/MTok
          </div>
        </>
      )}
    </div>
  );
}
