"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useConfig } from "@/hooks/use-config";
import { useOutreachPlan } from "@/hooks/use-outreach-plan";
import { useScrapeHistory } from "@/hooks/use-scrape";
import { Play, Monitor, MapPin, Search, ChevronDown, ChevronUp, Plus, X, Sparkles, Target, AlertTriangle } from "lucide-react";

interface Props {
  onStart: (queries: string[], limit: number, headless: boolean) => void;
  isStarting: boolean;
  isRunning: boolean;
}

interface CategoryConfig {
  key: string;
  label: string;
  queries: string[];
  enabled: boolean;
  ratio: number; // 0-100
}

const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { key: "cocktail_bar", label: "Cocktail Bars", queries: ["cocktail bars", "speakeasy", "craft cocktail bar"], enabled: true, ratio: 20 },
  { key: "wine_bar", label: "Wine Bars", queries: ["wine bars", "natural wine bar"], enabled: true, ratio: 15 },
  { key: "hotel_bar", label: "Hotel Bars", queries: ["boutique hotel bar", "hotel cocktail bar"], enabled: true, ratio: 10 },
  { key: "italian_restaurant", label: "Italian Restaurants", queries: ["Italian restaurant", "aperitivo bar"], enabled: true, ratio: 10 },
  { key: "gastropub", label: "Gastropubs", queries: ["gastropub", "craft beer pub cocktails"], enabled: true, ratio: 10 },
  { key: "bottle_shop", label: "Bottle Shops", queries: ["independent bottle shops", "craft spirits shop"], enabled: true, ratio: 10 },
  { key: "restaurant_groups", label: "Restaurant Groups", queries: ["restaurant group"], enabled: false, ratio: 5 },
  { key: "other", label: "Other (Delis, Farm Shops...)", queries: ["deli and wine shop", "farm shop spirits"], enabled: true, ratio: 20 },
];

export function ScrapeControl({ onStart, isStarting, isRunning }: Props) {
  const { data: config } = useConfig();
  const { data: plan } = useOutreachPlan(10);
  const { data: scrapeHistory } = useScrapeHistory();
  const [location, setLocation] = useState("UK");
  const [limit, setLimit] = useState(60);
  const [headless, setHeadless] = useState(false);
  const [categories, setCategories] = useState<CategoryConfig[]>(DEFAULT_CATEGORIES);
  const [showCategories, setShowCategories] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatQuery, setNewCatQuery] = useState("");

  // Detect if the same location was scraped recently (last 7 days)
  const recentDuplicate = useMemo(() => {
    if (!scrapeHistory || !location.trim()) return null;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (
      scrapeHistory.find((run) => {
        if (run.status !== "completed") return false;
        if (new Date(run.started_at).getTime() < cutoff) return false;
        return run.query.toLowerCase().includes(location.trim().toLowerCase());
      }) ?? null
    );
  }, [scrapeHistory, location]);

  const duplicateDaysAgo = recentDuplicate
    ? Math.round((Date.now() - new Date(recentDuplicate.started_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const enabledCategories = categories.filter((c) => c.enabled);
  const totalRatio = enabledCategories.reduce((sum, c) => sum + c.ratio, 0);

  const remaining = plan?.weekly_progress?.remaining ?? 100;
  const weeklyTotal = plan?.weekly_progress?.total ?? 0;
  const weeklyTarget = plan?.weekly_target ?? 100;
  const atTarget = remaining <= 0;

  function toggleCategory(key: string) {
    setCategories((prev) =>
      prev.map((c) => (c.key === key ? { ...c, enabled: !c.enabled } : c))
    );
  }

  function updateRatio(key: string, ratio: number) {
    setCategories((prev) =>
      prev.map((c) => (c.key === key ? { ...c, ratio } : c))
    );
  }

  function addCustomCategory() {
    if (!newCatLabel.trim() || !newCatQuery.trim()) return;
    const key = `custom_${newCatLabel.trim().toLowerCase().replace(/\s+/g, "_")}`;
    setCategories((prev) => [
      ...prev,
      {
        key,
        label: newCatLabel.trim(),
        queries: [newCatQuery.trim()],
        enabled: true,
        ratio: 10,
      },
    ]);
    setNewCatLabel("");
    setNewCatQuery("");
  }

  function removeCategory(key: string) {
    setCategories((prev) => prev.filter((c) => c.key !== key));
  }

  function handleStart() {
    const allQueries = enabledCategories.map(
      (c) => `${c.queries[0]} ${location}`.trim()
    );
    onStart(allQueries, Math.min(limit, remaining), headless);
  }

  // Summary of what will be scraped
  const querySummary = enabledCategories.map((c) => {
    const leads = Math.max(1, Math.round((c.ratio / totalRatio) * limit));
    return `${c.label}: ~${leads}`;
  });

  const disabled = isStarting || isRunning || !location || enabledCategories.length === 0 || atTarget;

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>Run Google Maps Scrape</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Location */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Location</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="e.g. London, Manchester..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={isRunning}
              className="pl-9"
            />
          </div>
        </div>

        {/* Category Selection */}
        <div className="space-y-2">
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-medium"
            onClick={() => setShowCategories(!showCategories)}
          >
            <span>
              Target Categories
              <span className="ml-2 text-xs text-muted-foreground">
                ({enabledCategories.length} selected)
              </span>
            </span>
            {showCategories ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {/* Quick category chips (always visible) */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => toggleCategory(cat.key)}
                disabled={isRunning}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  cat.enabled
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {cat.label}
                {cat.enabled && (
                  <span className="ml-1 opacity-70">{cat.ratio}%</span>
                )}
              </button>
            ))}
          </div>

          {/* Expanded ratio sliders */}
          {showCategories && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Adjust lead distribution per category</span>
                <span
                  className={
                    totalRatio > 0
                      ? "text-foreground"
                      : "text-red-500"
                  }
                >
                  Total: {totalRatio}%
                </span>
              </div>
              {categories.map((cat) => (
                <div key={cat.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={cat.enabled}
                        onChange={() => toggleCategory(cat.key)}
                        disabled={isRunning}
                        className="rounded accent-primary"
                      />
                      <span className={cat.enabled ? "text-foreground" : "text-muted-foreground"}>
                        {cat.label}
                      </span>
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="w-10 text-right font-mono text-xs font-bold">
                        {cat.ratio}%
                      </span>
                      {cat.key.startsWith("custom_") && (
                        <button
                          type="button"
                          onClick={() => removeCategory(cat.key)}
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {cat.enabled && (
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={5}
                      value={cat.ratio}
                      onChange={(e) => updateRatio(cat.key, Number(e.target.value))}
                      disabled={isRunning}
                      className="w-full accent-primary"
                    />
                  )}
                </div>
              ))}

              {/* Add custom category */}
              <div className="border-t border-border/50 pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Add Custom Category</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Label (e.g. Rooftop Bars)"
                    value={newCatLabel}
                    onChange={(e) => setNewCatLabel(e.target.value)}
                    className="h-8 text-xs"
                    disabled={isRunning}
                  />
                  <Input
                    placeholder="Search query (e.g. rooftop bar)"
                    value={newCatQuery}
                    onChange={(e) => setNewCatQuery(e.target.value)}
                    className="h-8 text-xs"
                    disabled={isRunning}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addCustomCategory}
                    disabled={isRunning || !newCatLabel.trim() || !newCatQuery.trim()}
                    className="h-8 shrink-0"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Total lead limit — capped at weekly remaining */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              Total Leads: {Math.min(limit, remaining)}
            </label>
            <span className="text-[10px] text-muted-foreground font-mono">
              {weeklyTotal} / {weeklyTarget} this week — {remaining} remaining
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={Math.max(1, remaining)}
            step={5}
            value={Math.min(limit, remaining)}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="w-full accent-primary"
            disabled={isRunning || atTarget}
          />
          {atTarget && (
            <p className="text-[11px] text-emerald-400 font-medium">
              Weekly target reached — no more scraping needed this week
            </p>
          )}
        </div>

        {/* Lead distribution preview */}
        {enabledCategories.length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-2.5">
            <p className="text-xs text-muted-foreground mb-1.5">Lead distribution:</p>
            <div className="flex flex-wrap gap-1.5">
              {enabledCategories.map((cat) => {
                const leads = Math.max(1, Math.round((cat.ratio / totalRatio) * limit));
                return (
                  <Badge key={cat.key} variant="secondary" className="text-xs">
                    {cat.label}: ~{leads}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Recommendations */}
        {plan && plan.scrape_recommendations && plan.scrape_recommendations.length > 0 && (
          <div className="space-y-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-purple-400">
                <Sparkles className="h-3 w-3" />
                AI recommended
              </p>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Target className="h-3 w-3" />
                {plan.weekly_progress.total} / {plan.weekly_target} this week
              </span>
            </div>
            {plan.scrape_recommendations.map((rec) => (
              <button
                key={rec.category}
                type="button"
                disabled={isRunning}
                className="flex w-full items-center gap-2 rounded-md border border-border/30 bg-card/50 p-2 text-left text-xs transition-colors hover:bg-accent/50"
                onClick={() => {
                  // Pre-fill: enable this category, set limit to suggested, apply location
                  const query = rec.queries[0] ? `${rec.queries[0]} ${location}`.trim() : "";
                  if (query) {
                    onStart([query], rec.suggested_leads, headless);
                  }
                }}
              >
                <Badge variant="secondary" className="text-[9px] capitalize shrink-0">
                  {rec.category.replace(/_/g, " ")}
                </Badge>
                <span className="flex-1 text-muted-foreground truncate">
                  {rec.reason}
                </span>
                <span className="font-mono font-medium text-purple-400 shrink-0">
                  +{rec.suggested_leads}
                </span>
                <Play className="h-3 w-3 text-purple-400 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Headless mode */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={headless}
            onChange={(e) => setHeadless(e.target.checked)}
            className="rounded accent-primary"
            disabled={isRunning}
          />
          <Monitor className="h-4 w-4 text-muted-foreground" />
          Headless mode (hide browser window)
        </label>

        {/* Duplicate scrape warning */}
        {recentDuplicate && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-semibold">Similar scrape already ran</span>
              {" "}—{" "}
              {duplicateDaysAgo === 0
                ? "today"
                : `${duplicateDaysAgo} day${duplicateDaysAgo !== 1 ? "s" : ""} ago`}
              {" "}({recentDuplicate.leads_found} leads found). You can still run it again.
            </span>
          </div>
        )}

        {/* Start button */}
        <Button
          onClick={handleStart}
          disabled={disabled}
          className="w-full bg-gradient-to-r from-primary to-primary/80 shadow-md transition-shadow hover:shadow-lg"
        >
          <Play className="mr-2 h-4 w-4" />
          {atTarget
            ? "Weekly target reached"
            : isRunning
              ? "Scraping..."
              : `Start Scrape (${enabledCategories.length} categories, ~${Math.min(limit, remaining)} leads)`}
        </Button>
      </CardContent>
    </Card>
  );
}
