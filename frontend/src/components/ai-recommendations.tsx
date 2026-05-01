"use client";

import { Sparkles, ChevronRight, TrendingUp, Edit3, Star, MessageSquare, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStrategy } from "@/hooks/use-recommendations";
import { useQueryClient } from "@tanstack/react-query";

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const EDIT_CAT_LABELS: Record<string, string> = {
  tone: "Tone", product_focus: "Product Focus", length: "Length",
  personalization: "Personalization", factual_error: "Factual Error",
  structure: "Structure", other: "Other",
};

interface Props {
  compact?: boolean;
}

export function AIRecommendations({ compact = false }: Props) {
  const { data, isLoading, error, isFetching } = useStrategy();
  const qc = useQueryClient();

  const insights = data?.insights ?? [];
  const editPatterns = data?.edit_patterns ?? [];
  const contentSignals = data?.content_signals;
  const replySentiment = data?.reply_sentiment;
  const ratioAdjustments = data?.ratio_adjustments ?? [];
  const querySuggestions = data?.query_suggestions ?? [];

  const shownInsights = compact ? insights.slice(0, 3) : insights;

  const totalRated = contentSignals
    ? contentSignals.great + contentSignals.good + contentSignals.not_interested
    : 0;
  const totalReplies = replySentiment
    ? replySentiment.positive + replySentiment.negative + replySentiment.neutral
    : 0;

  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-purple-500" />
            AI Strategy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : error || !data || insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {(data?.total_sent ?? 0) >= 5
                ? "No insights generated — check Analytics."
                : "Send 5+ emails to unlock AI insights."}
            </p>
          ) : (
            shownInsights.map((insight, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className={PRIORITY_COLORS[insight.priority] ?? PRIORITY_COLORS.medium} variant="outline">
                    {insight.priority}
                  </Badge>
                  <span className="font-medium text-sm">{insight.title}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{insight.description}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  // Full view (used on analytics page)
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <h2 className="font-semibold text-base">AI Strategy</h2>
          {data?.total_sent !== undefined && (
            <span className="text-xs text-muted-foreground">
              {data.total_sent} sent · {data.overall_reply_rate}% reply · {data.overall_open_rate}% open
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["recommendations", "strategy"] })}
          disabled={isFetching}
          className="gap-1.5 h-7 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Analysing…" : "Refresh"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground">Failed to load. Try refreshing.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Strategy Insights */}
          <div className="space-y-3 lg:col-span-2">
            {insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {(data?.total_sent ?? 0) < 5
                  ? "Send at least 5 emails before AI can generate insights."
                  : "No insights generated — try refreshing."}
              </p>
            ) : (
              insights.map((insight, i) => (
                <div key={i} className="rounded-xl border p-4 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={PRIORITY_COLORS[insight.priority] ?? PRIORITY_COLORS.medium} variant="outline">
                      {insight.priority}
                    </Badge>
                    {insight.category && (
                      <Badge variant="secondary" className="text-xs capitalize">
                        {insight.category.replace(/_/g, " ")}
                      </Badge>
                    )}
                    <span className="font-medium text-sm">{insight.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{insight.description}</p>
                  <div className="flex items-center gap-1 text-sm font-medium text-primary">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    {insight.action}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Edit Patterns */}
          {editPatterns.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">What You Edit Most</h3>
              </div>
              <div className="space-y-2">
                {editPatterns.map((pat) => (
                  <div key={pat.category} className="flex items-center gap-3 text-sm rounded-lg border p-2.5">
                    <span className="w-28 shrink-0 text-xs font-medium capitalize">
                      {EDIT_CAT_LABELS[pat.category] ?? pat.category}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pat.pct}%` }} />
                    </div>
                    <span className="text-xs tabular-nums w-8 text-right">{pat.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content Ratings */}
          {contentSignals && totalRated > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Content Ratings</h3>
              </div>
              <div className="flex gap-3">
                {[
                  { label: "Great", count: contentSignals.great, cls: "text-emerald-600" },
                  { label: "Good", count: contentSignals.good, cls: "text-amber-600" },
                  { label: "Not Interested", count: contentSignals.not_interested, cls: "text-red-500" },
                ].map(({ label, count, cls }) => (
                  <div key={label} className="flex-1 rounded-lg border p-3 text-center">
                    <div className={`text-lg font-bold ${cls}`}>{count}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              {contentSignals.great_subjects.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {contentSignals.great_subjects.map((s, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Star className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                      "{s}"
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reply Sentiment */}
          {replySentiment && totalReplies > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Reply Sentiment</h3>
              </div>
              <div className="flex gap-3">
                {[
                  { label: "Positive", count: replySentiment.positive, cls: "text-emerald-600" },
                  { label: "Neutral", count: replySentiment.neutral, cls: "text-amber-600" },
                  { label: "Negative", count: replySentiment.negative, cls: "text-red-500" },
                ].map(({ label, count, cls }) => (
                  <div key={label} className="flex-1 rounded-lg border p-3 text-center">
                    <div className={`text-lg font-bold ${cls}`}>{count}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ratio Adjustments */}
          {ratioAdjustments.length > 0 && (
            <div className="space-y-3 lg:col-span-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Suggested Ratio Changes</h3>
              </div>
              <div className="space-y-2">
                {ratioAdjustments.map((adj, i) => (
                  <div key={i} className="flex items-center gap-4 text-sm rounded-lg border p-3">
                    <span className="w-36 font-medium capitalize">{adj.category.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {Math.round(adj.current_ratio)}% → <span className="text-primary font-bold">{Math.round(adj.recommended_ratio)}%</span>
                    </span>
                    <span className="text-xs text-muted-foreground flex-1">{adj.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Suggestions */}
          {querySuggestions.length > 0 && (
            <div className="space-y-2 lg:col-span-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Suggested Search Queries</h3>
              <div className="flex flex-wrap gap-2">
                {querySuggestions.map((q, i) => (
                  <Badge key={i} variant="secondary" className="text-xs px-3 py-1">{q}</Badge>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
