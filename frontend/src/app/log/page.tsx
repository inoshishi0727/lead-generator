"use client";

import { useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGenerationLog } from "@/hooks/use-generation-log";

const PROVIDER_LABEL: Record<string, string> = {
  claude: "Claude",
  gemini: "Gemini",
};

const PROMPT_LABEL: Record<string, string> = {
  v1: "v1 (original)",
  v17: "v1.7 (new prompt)",
};

const PROVIDER_COLOR: Record<string, string> = {
  claude: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  gemini: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

const PROMPT_COLOR: Record<string, string> = {
  v1: "bg-muted text-muted-foreground border-border",
  v17: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const TRIGGER_COLOR: Record<string, string> = {
  initial: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  regenerate: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export default function GenerationLogPage() {
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [promptFilter, setPromptFilter] = useState<string>("all");

  const { data: entries = [], isLoading, refetch } = useGenerationLog({
    provider: providerFilter === "all" ? undefined : providerFilter,
    prompt_version: promptFilter === "all" ? undefined : promptFilter,
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

      <div className="flex gap-3">
        <Select value={providerFilter} onValueChange={(v) => setProviderFilter(v ?? "all")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All models</SelectItem>
            <SelectItem value="claude">Claude</SelectItem>
            <SelectItem value="gemini">Gemini</SelectItem>
          </SelectContent>
        </Select>

        <Select value={promptFilter} onValueChange={(v) => setPromptFilter(v ?? "all")}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All prompts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All prompts</SelectItem>
            <SelectItem value="v1">v1 (original)</SelectItem>
            <SelectItem value="v17">v1.7 (new prompt)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">All generated drafts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground italic">No generation records yet. Records appear after drafts are generated or regenerated.</div>
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
                      <Badge variant="outline" className={`text-[10px] ${PROVIDER_COLOR[entry.provider] || ""}`}>
                        {PROVIDER_LABEL[entry.provider] || entry.provider}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${PROMPT_COLOR[entry.prompt_version] || ""}`}>
                        {PROMPT_LABEL[entry.prompt_version] || entry.prompt_version}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] capitalize ${TRIGGER_COLOR[entry.triggered_by] || ""}`}>
                        {entry.triggered_by}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {entry.generated_at
                          ? new Date(entry.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
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
