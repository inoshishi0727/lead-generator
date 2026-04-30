"use client";

import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useStrategy } from "@/hooks/use-recommendations";

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export function AIRecommendations() {
  const { data, isLoading, error } = useStrategy();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load recommendations. Try again later.</p>
        </CardContent>
      </Card>
    );
  }

  const insights = data?.insights ?? [];
  const ratioAdjustments = data?.ratio_adjustments ?? [];
  const querySuggestions = data?.query_suggestions ?? [];

  if (!data || (insights.length === 0 && ratioAdjustments.length === 0 && querySuggestions.length === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No recommendations yet. Send more outreach and check back — AI analysis requires at least a few weeks of data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          AI Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Strategy Insights */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Strategy Insights</h3>
          {insights.map((insight, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Badge className={priorityColors[insight.priority] ?? priorityColors.medium} variant="outline">
                  {insight.priority}
                </Badge>
                <span className="font-medium text-sm">{insight.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{insight.description}</p>
              <p className="text-sm font-medium text-primary">{insight.action}</p>
            </div>
          ))}
        </div>

        {/* Ratio Adjustments */}
        {ratioAdjustments.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Suggested Ratio Changes</h3>
            {ratioAdjustments.map((adj, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="font-medium capitalize">{adj.category.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">
                  {Math.round(adj.current_ratio * 100)}%
                </span>
                <span className="text-primary font-bold">
                  {Math.round(adj.recommended_ratio * 100)}%
                </span>
                <span className="text-xs text-muted-foreground">{adj.reason}</span>
              </div>
            ))}
          </div>
        )}

        {/* Query Suggestions */}
        {querySuggestions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Suggested Search Queries</h3>
            <div className="flex flex-wrap gap-2">
              {querySuggestions.map((q, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {q}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
