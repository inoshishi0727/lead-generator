"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, DollarSign, MessageCircle, Zap, TrendingUp, FileText, Bot } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { useAuth } from "@/lib/auth-context";

interface DailyRow {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  cost: number;
  calls?: number;
  drafts?: number;
  generations?: number;
}

interface CostResponse {
  windowDays: number | null;
  all: boolean;
  since: string | null;
  pricing: Record<string, any>;
  totals: Record<string, any>;
  daily: DailyRow[];
}

type Window = 7 | 30 | 90 | "all";
type Tab = "jarvis" | "drafts";

// Defensive: the jarvis and drafts tabs render with different `totals` shapes,
// and a tab switch can race the fetch — when that happens the still-current
// `data` is from the previous tab and missing the field the new tab expects.
// Coercing undefined → 0 keeps the page rendering "$0" / "0" while the new
// fetch lands instead of throwing on .toLocaleString.
const fmtUsd = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

const fmtNum = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");

export default function CostAnalyticsPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("jarvis");
  const [windowSel, setWindowSel] = useState<Window>(30);
  const [data, setData] = useState<CostResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    // Clear stale data — the jarvis and drafts responses have different
    // shapes (totals.sessions vs totals.drafts), and rendering one branch
    // with the other's data crashes on `undefined.toLocaleString`.
    setData(null);
    const endpoint = tab === "jarvis" ? "/api/analytics/cost" : "/api/analytics/draft-cost";
    const qs = windowSel === "all" ? "all=1" : `days=${windowSel}`;
    fetch(`${endpoint}?${qs}`)
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
  }, [tab, windowSel]);

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
      <Link
        href="/analytics"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={12} />
        Back to Analytics
      </Link>
      <div className="flex items-center gap-2">
        {tab === "jarvis" ? (
          <Bot className="h-5 w-5 text-emerald-500" />
        ) : (
          <FileText className="h-5 w-5 text-blue-500" />
        )}
        <h1 className="text-xl font-semibold">
          {tab === "jarvis" ? "Jarvis AI Cost" : "Draft Generation Cost"}
        </h1>
        <span className="text-xs text-muted-foreground ml-2">
          {tab === "jarvis"
            ? "Claude Haiku 4.5 token usage and spend."
            : "Claude Sonnet 4 / Gemini 2.5 Flash draft generation spend (estimated)."}
        </span>
        <div className="ml-auto flex gap-1">
          {(["jarvis", "drafts"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs px-3 py-1 rounded border capitalize ${
                tab === t
                  ? "border-amber-500 text-amber-500"
                  : "border-zinc-800 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-2">
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
          {tab === "jarvis" && (
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
            </>
          )}

          {tab === "drafts" && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  icon={DollarSign}
                  label={data.all ? "Total spend (all time)" : `Total spend (${data.windowDays}d)`}
                  value={fmtUsd(data.totals.cost)}
                />
                <StatCard
                  icon={FileText}
                  label="Generation calls"
                  value={fmtNum(data.totals.drafts)}
                />
                <StatCard
                  icon={TrendingUp}
                  label="Avg cost / generation"
                  value={fmtUsd(data.totals.avgCostPerDraft)}
                />
                <StatCard
                  icon={Zap}
                  label="Input tokens (est.)"
                  value={fmtNum(data.totals.inputTokens)}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  icon={Zap}
                  label="Output tokens (est.)"
                  value={fmtNum(data.totals.outputTokens)}
                />
                {Object.entries(data.totals.byProvider || {}).map(([provider, stats]: [string, any]) => (
                  <StatCard
                    key={provider}
                    icon={Bot}
                    label={`${data.pricing[provider]?.model || provider}`}
                    value={`${fmtNum(stats.generations ?? stats.drafts)} gens · ${fmtUsd(stats.cost)}`}
                  />
                ))}
              </div>
            </>
          )}

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
                      <div className="flex-1 bg-muted/40 rounded h-4 relative overflow-hidden">
                        <div
                          className="h-full bg-emerald-500/50 dark:bg-emerald-500/40 rounded-sm transition-[width]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-20 text-right tabular-nums">{fmtUsd(d.cost)}</span>
                      <span className="w-16 text-right tabular-nums text-muted-foreground">
                        {tab === "drafts"
                          ? `${d.generations ?? d.drafts ?? 0} gen${(d.generations ?? d.drafts ?? 0) === 1 ? "" : "s"}`
                          : `${d.calls ?? 0} call${(d.calls ?? 0) === 1 ? "" : "s"}`
                        }
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground">
            {tab === "jarvis" ? (
              <>Pricing — input: ${data.pricing.inputPerMTok.toFixed(2)}/MTok · output: ${data.pricing.outputPerMTok.toFixed(2)}/MTok · cache write: ${data.pricing.cacheWritePerMTok.toFixed(2)}/MTok · cache read: ${data.pricing.cacheReadPerMTok.toFixed(2)}/MTok</>
            ) : (
              <>Pricing — Claude Sonnet 4: input ${data.pricing.claude?.inputPerMTok.toFixed(2)}/MTok · output ${data.pricing.claude?.outputPerMTok.toFixed(2)}/MTok · Gemini 2.5 Flash: input ${data.pricing.gemini?.inputPerMTok.toFixed(2)}/MTok · output ${data.pricing.gemini?.outputPerMTok.toFixed(2)}/MTok</>
            )}
          </div>
        </>
      )}
    </div>
  );
}
