"use client";

import { Copy, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRatioSuggestions } from "@/hooks/use-ratios";

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

export function SuggestedQueries() {
  const { data, isLoading } = useRatioSuggestions();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Suggested Search Queries</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  const suggestions = data?.suggestions ?? [];

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Suggested Search Queries</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All categories are on target. No additional queries needed.
          </p>
        </CardContent>
      </Card>
    );
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Suggested Search Queries
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground mb-3">
          Based on underrepresented categories in your current lead pool.
        </p>
        {suggestions.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border p-2.5"
          >
            <Badge
              variant="outline"
              className={priorityColors[s.priority] ?? ""}
            >
              {s.priority}
            </Badge>
            <span className="text-xs text-muted-foreground capitalize">
              {s.category.replace(/_/g, " ")}
            </span>
            <span className="flex-1 text-sm font-medium">{s.query}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(s.query)}
              className="h-7 px-2"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
