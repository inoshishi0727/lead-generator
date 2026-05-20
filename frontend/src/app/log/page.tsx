"use client";

import { useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGenerationLog } from "@/hooks/use-generation-log";
import type { GenerationLogEntry } from "@/lib/types";

const SOURCE_LABEL: Record<GenerationLogEntry["generation_source"], string> = {
  v1: "v1",
  claude: "Claude",
  gemini: "Gemini",
  latest: "Latest prompt",
};

const SOURCE_COLOR: Record<GenerationLogEntry["generation_source"], string> = {
  v1: "bg-muted text-muted-foreground border-border",
  claude: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  gemini: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  latest: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export default function GenerationLogPage() {
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const { data: entries = [], isLoading, refetch } = useGenerationLog({
    generation_source: sourceFilter === "all" ? undefined : sourceFilter,
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Generation Log</h1>
          <span className="text-sm text-muted-foreground ml-1">
            {isLoading ? "Loading..." : `${entries.length} records`}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v ?? "all")}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="All generations" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All generations</SelectItem>
          <SelectItem value="v1">v1 (original)</SelectItem>
          <SelectItem value="claude">Generated with Claude</SelectItem>
          <SelectItem value="gemini">Generated with Gemini</SelectItem>
          <SelectItem value="latest">Generated with latest prompt</SelectItem>
        </SelectContent>
      </Select>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">All generated drafts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground italic">
              No generation records yet. Records appear after drafts are generated or regenerated.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {entries.map((entry) => (
                <div key={entry.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium truncate">{entry.business_name}</span>
                        {entry.venue_category && (
                          <span className="text-xs text-muted-foreground">
                            {entry.venue_category.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.subject || "(no subject)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      <Badge variant="outline" className={`text-[10px] ${SOURCE_COLOR[entry.generation_source] ?? ""}`}>
                        {SOURCE_LABEL[entry.generation_source] ?? entry.generation_source}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {entry.generated_at
                          ? new Date(entry.generated_at).toLocaleDateString("en-GB", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
