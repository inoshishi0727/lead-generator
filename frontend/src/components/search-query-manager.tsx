"use client";

import { useEffect, useRef, useState } from "react";
import { Save, RotateCcw, Plus, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSearchQueries,
  useUpdateSearchQueries,
  useImportQueries,
  type SearchQueries,
} from "@/hooks/use-search-queries";

const SOURCE_LABELS: Record<keyof SearchQueries, string> = {
  google_maps: "Google Maps",
  google_search: "Google Search",
  bing_search: "Bing Search",
  directory: "Directory URLs",
};

const SOURCE_DESCRIPTIONS: Record<keyof SearchQueries, string> = {
  google_maps: "Venue-based searches (bars, restaurants, shops)",
  google_search: "B2B company searches (subscription boxes, airlines, RTD)",
  bing_search: "Same B2B queries on Bing for broader coverage",
  directory: "Category page URLs for Yell.com, Trustpilot, etc.",
};

const EMPTY: SearchQueries = {
  google_maps: [],
  google_search: [],
  bing_search: [],
  directory: [],
};

export function SearchQueryManager() {
  const { data, isLoading } = useSearchQueries();
  const updateMutation = useUpdateSearchQueries();
  const importMutation = useImportQueries();
  const [queries, setQueries] = useState<SearchQueries>(EMPTY);
  const [hasChanges, setHasChanges] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importSource, setImportSource] = useState<keyof SearchQueries>("google_maps");

  useEffect(() => {
    if (data) {
      setQueries(data);
      setHasChanges(false);
    }
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Search Queries</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  function updateQuery(source: keyof SearchQueries, index: number, value: string) {
    setQueries((prev) => {
      const updated = { ...prev };
      updated[source] = [...prev[source]];
      updated[source][index] = value;
      return updated;
    });
    setHasChanges(true);
  }

  function addQuery(source: keyof SearchQueries) {
    setQueries((prev) => ({
      ...prev,
      [source]: [...prev[source], ""],
    }));
    setHasChanges(true);
  }

  function removeQuery(source: keyof SearchQueries, index: number) {
    setQueries((prev) => ({
      ...prev,
      [source]: prev[source].filter((_, i) => i !== index),
    }));
    setHasChanges(true);
  }

  function handleSave() {
    // Filter out empty strings
    const cleaned: SearchQueries = {
      google_maps: queries.google_maps.filter((q) => q.trim()),
      google_search: queries.google_search.filter((q) => q.trim()),
      bing_search: queries.bing_search.filter((q) => q.trim()),
      directory: queries.directory.filter((q) => q.trim()),
    };
    updateMutation.mutate(cleaned);
    setHasChanges(false);
  }

  function handleReset() {
    if (data) {
      setQueries(data);
      setHasChanges(false);
    }
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text
        .split(/[\r\n]+/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));

      if (lines.length > 0) {
        importMutation.mutate({ source: importSource, queries: lines });
      }
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const sources = Object.keys(SOURCE_LABELS) as (keyof SearchQueries)[];
  const totalQueries = sources.reduce((sum, s) => sum + queries[s].length, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Search Queries</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalQueries} queries across {sources.length} sources
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {sources.map((source) => (
          <div key={source} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">{SOURCE_LABELS[source]}</h3>
                <p className="text-xs text-muted-foreground">
                  {SOURCE_DESCRIPTIONS[source]}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {queries[source].length}
              </Badge>
            </div>

            <div className="space-y-1.5">
              {queries[source].map((query, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={query}
                    onChange={(e) => updateQuery(source, i, e.target.value)}
                    placeholder={
                      source === "directory"
                        ? "https://www.yell.com/s/..."
                        : "e.g. cocktail bars Manchester"
                    }
                    className="h-8 text-sm font-mono"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeQuery(source, i)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => addQuery(source)}
                className="h-7 text-xs"
              >
                <Plus className="mr-1 h-3 w-3" />
                Add query
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setImportSource(source);
                  fileInputRef.current?.click();
                }}
                className="h-7 text-xs"
              >
                <Upload className="mr-1 h-3 w-3" />
                Import CSV
              </Button>
            </div>
          </div>
        ))}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileImport}
          className="hidden"
        />

        {updateMutation.isSuccess && (
          <p className="text-sm text-emerald-500">Queries saved.</p>
        )}
        {importMutation.isSuccess && (
          <p className="text-sm text-emerald-500">Queries imported and merged.</p>
        )}
      </CardContent>
    </Card>
  );
}
