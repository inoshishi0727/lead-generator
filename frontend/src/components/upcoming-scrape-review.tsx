"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useScrapeHistory } from "@/hooks/use-scrape";
import { useSearchQueries } from "@/hooks/use-search-queries";
import { AlertTriangle, Calendar, CheckCircle2 } from "lucide-react";

/** Saturday midnight BST = Friday 23:00 UTC */
function getNextScrapeDate(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  // Target: Friday 23:00 UTC
  let daysUntilFriday = (5 - day + 7) % 7;
  if (daysUntilFriday === 0 && now.getUTCHours() >= 23) {
    daysUntilFriday = 7;
  }
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilFriday);
  next.setUTCHours(23, 0, 0, 0);
  return next;
}

function daysUntil(target: Date): number {
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeFp(queries: string[]): string {
  return [...queries]
    .map((q) => q.toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

export function UpcomingScrapeReview() {
  const { data: runs } = useScrapeHistory();
  const { data: searchQueries } = useSearchQueries();

  const nextScrape = useMemo(() => getNextScrapeDate(), []);
  const daysLeft = useMemo(() => daysUntil(nextScrape), [nextScrape]);

  // Only show within 3 days of next scrape
  if (daysLeft > 3) return null;

  const lastRun = runs?.find((r) => r.status === "completed") ?? null;

  // Upcoming queries come from Firestore overrides or config default
  const upcomingQueries = searchQueries?.google_maps ?? [];

  const isDuplicate = useMemo(() => {
    if (!lastRun?.query || upcomingQueries.length === 0) return false;
    const upcomingFp = normalizeFp(upcomingQueries);
    const lastQueries = lastRun.query.split(",").map((q) => q.trim());
    const lastFp = normalizeFp(lastQueries);
    return upcomingFp === lastFp;
  }, [lastRun, upcomingQueries]);

  const dayLabel =
    daysLeft <= 0
      ? "Today"
      : daysLeft === 1
        ? "Tomorrow"
        : `In ${daysLeft} days`;

  return (
    <Card
      className={
        isDuplicate
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-blue-500/20 bg-blue-500/5"
      }
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            {isDuplicate ? (
              <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            ) : (
              <Calendar className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold">
                {isDuplicate
                  ? "Scheduled scrape using same parameters"
                  : "Upcoming scheduled scrape"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {dayLabel} &mdash;{" "}
                {nextScrape.toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}{" "}
                at midnight UK
              </p>
            </div>
          </div>
          <Badge
            variant={isDuplicate ? "destructive" : "secondary"}
            className="text-[10px] shrink-0"
          >
            {isDuplicate ? "Duplicate params" : dayLabel}
          </Badge>
        </div>

        {isDuplicate && (
          <p className="text-xs text-amber-300/80">
            The queries for the next scheduled scrape are identical to the last
            completed run
            {lastRun?.started_at && (
              <>
                {" "}
                on{" "}
                {new Date(lastRun.started_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </>
            )}
            {lastRun?.leads_found != null && (
              <> ({lastRun.leads_found} leads found)</>
            )}
            . Consider updating your search queries via CSV upload or changing
            the location to avoid scraping the same results.
          </p>
        )}

        {upcomingQueries.length > 0 && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">
              Queries ({upcomingQueries.length}):
            </p>
            <div className="flex flex-wrap gap-1">
              {upcomingQueries.slice(0, 8).map((q, i) => (
                <Badge key={i} variant="secondary" className="text-[10px] font-mono">
                  {q}
                </Badge>
              ))}
              {upcomingQueries.length > 8 && (
                <Badge variant="secondary" className="text-[10px]">
                  +{upcomingQueries.length - 8} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {!isDuplicate && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Parameters differ from last run
          </div>
        )}
      </CardContent>
    </Card>
  );
}
