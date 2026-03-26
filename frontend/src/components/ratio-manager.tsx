"use client";

import { useEffect, useState } from "react";
import { Save, RotateCcw, Check, ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRatioConfig, useUpdateRatios } from "@/hooks/use-ratios";

const CATEGORY_LABELS: Record<string, string> = {
  cocktail_bar: "Cocktail Bars",
  wine_bar: "Wine Bars",
  hotel_bar: "Hotel Bars",
  italian_restaurant: "Italian Restaurants",
  gastropub: "Gastropubs",
  bottle_shop: "Bottle Shops",
  restaurant_groups: "Restaurant Groups",
  other: "Other",
};

const DEFAULTS: Record<string, number> = {
  cocktail_bar: 0.2,
  wine_bar: 0.15,
  hotel_bar: 0.1,
  italian_restaurant: 0.1,
  gastropub: 0.1,
  bottle_shop: 0.1,
  restaurant_groups: 0.05,
  other: 0.2,
};

export function RatioManager() {
  const { data, isLoading } = useRatioConfig();
  const updateMutation = useUpdateRatios();
  const [ratios, setRatios] = useState<Record<string, number>>(DEFAULTS);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync from API on load
  useEffect(() => {
    if (data?.target) {
      setRatios(data.target);
      setHasChanges(false);
    }
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Lead Category Ratios</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-64 w-full" /></CardContent>
      </Card>
    );
  }

  const actual = data?.actual ?? {};
  const total = Object.values(ratios).reduce((sum, v) => sum + v, 0);
  const totalPct = Math.round(total * 100);
  const isValid = totalPct >= 99 && totalPct <= 101; // Allow 1% rounding tolerance

  function handleSliderChange(category: string, value: number) {
    setRatios((prev) => ({ ...prev, [category]: value / 100 }));
    setHasChanges(true);
  }

  function handleSave() {
    updateMutation.mutate(ratios);
    setHasChanges(false);
  }

  function handleReset() {
    setRatios(DEFAULTS);
    setHasChanges(true);
  }

  const categories = Object.keys(CATEGORY_LABELS);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Lead Category Ratios</CardTitle>
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-mono ${
                isValid ? "text-emerald-500" : "text-red-500"
              }`}
            >
              Total: {totalPct}%
            </span>
            {!isValid && (
              <Badge variant="destructive" className="text-xs">
                Must equal 100%
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.map((cat) => {
          const targetPct = Math.round((ratios[cat] ?? 0) * 100);
          const actualPct = Math.round((actual[cat] ?? 0) * 100);
          const delta = targetPct - actualPct;
          const onTarget = Math.abs(delta) <= 5;

          return (
            <div key={cat} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    Actual: {actualPct}%
                  </span>
                  {onTarget ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : delta > 0 ? (
                    <ArrowDown className="h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span className="w-10 text-right font-mono text-sm font-bold">
                    {targetPct}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={targetPct}
                  onChange={(e) =>
                    handleSliderChange(cat, Number(e.target.value))
                  }
                  className="w-full accent-primary"
                />
              </div>
            </div>
          );
        })}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || !isValid || updateMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="mr-1.5 h-4 w-4" />
            {updateMutation.isPending ? "Saving..." : "Save Ratios"}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={!hasChanges}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Reset Defaults
          </Button>
        </div>

        {updateMutation.isSuccess && (
          <p className="text-sm text-emerald-600">Ratios saved successfully.</p>
        )}
      </CardContent>
    </Card>
  );
}
