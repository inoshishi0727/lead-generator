"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Globe, Check, X, CopyCheck } from "lucide-react";
import { useQuickAdd } from "@/hooks/use-quick-add";
import { useScrapeUrl } from "@/hooks/use-scrape-url";
import type { ScrapeBatchStatus, ScrapeBatchItem } from "@/hooks/use-scrape-batch";

/** True for a website URL we can fetch and mine for venues. Google Maps / goo.gl
 *  links are excluded — those go through quick-add as a single skeleton lead. */
function isScrapeableUrl(raw: string): boolean {
  const s = raw.trim();
  const hasScheme = /^https?:\/\//i.test(s);
  const looksLikeHost = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+(\/|$|\?)/i.test(s);
  if (!hasScheme && !looksLikeHost) return false;
  try {
    const u = new URL(hasScheme ? s : `https://${s}`);
    const host = u.hostname.toLowerCase();
    if (host.includes("google.") || host === "goo.gl" || host.endsWith("maps.app.goo.gl")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function VenueRow({ item }: { item: ScrapeBatchItem }) {
  const name = item.business_name || item.input;
  const running = item.status === "running" || item.status === "pending";
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 shrink-0">
        {running && <Loader2 size={12} className="sp-spin text-muted-foreground" />}
        {item.status === "added" && <Check size={12} className="text-emerald-500" />}
        {item.status === "duplicate" && <CopyCheck size={12} className="text-amber-500" />}
        {item.status === "error" && <X size={12} className="text-rose-500" />}
      </span>
      <span className="min-w-0">
        <span className="text-foreground">{name}</span>
        {running && item.step && <span className="text-muted-foreground"> — {item.step}</span>}
        {item.status === "duplicate" && <span className="text-muted-foreground"> — already have it</span>}
        {item.error && (
          <span className={item.status === "error" ? "text-rose-400" : "text-muted-foreground"}>
            {" "}— {item.error}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Universal add box. If the input is a website URL (a blog, a "best bars"
 * listicle, or a single venue site) we fetch it, extract every venue via
 * Gemini and enrich each into a lead — showing live per-venue progress and
 * why anything couldn't be scraped. Otherwise (a name, a Maps link, plain
 * text) it drops in a skeleton lead to scrape later.
 */
export function AddSpecificVenue() {
  const [value, setValue] = useState("");
  const [lastJob, setLastJob] = useState<ScrapeBatchStatus | null>(null);
  const quickAdd = useQuickAdd();
  const scrapeUrl = useScrapeUrl();

  const urlJob = scrapeUrl.status;
  const urlRunning =
    scrapeUrl.isStarting ||
    (!!urlJob && urlJob.status !== "completed" && urlJob.status !== "failed");
  const busy = quickAdd.isPending || urlRunning;
  const willScrape = isScrapeableUrl(value);

  // Keep the last job visible after it completes (the hook clears its own
  // status on terminal), so the user can still see what was added / failed.
  useEffect(() => {
    if (urlJob) setLastJob(urlJob);
  }, [urlJob]);

  const shown = urlJob ?? lastJob;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (isScrapeableUrl(trimmed)) {
      setLastJob(null);
      scrapeUrl.start(trimmed);
      setValue("");
    } else {
      quickAdd.mutate([trimmed], { onSuccess: () => setValue("") });
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={onSubmit} className="sp-add-venue">
        <input
          type="text"
          placeholder="Paste a URL (blog / listing / venue) to extract & enrich, or a name to save"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          className="sp-add-venue-input"
          aria-label="Add a lead — paste a URL to scrape or a name to save"
        />
        <button type="submit" disabled={busy || !value.trim()} className="sp-btn primary">
          {busy ? (
            <>
              <Loader2 size={13} className="sp-spin" />
              {urlRunning ? "Scraping…" : "Saving…"}
            </>
          ) : willScrape ? (
            <>
              <Globe size={13} />
              Scrape URL
            </>
          ) : (
            <>
              <Plus size={13} />
              Save lead
            </>
          )}
        </button>
      </form>

      {shown && (
        <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-2.5">
          <p className="text-xs font-medium text-muted-foreground">
            {urlRunning
              ? shown.total > 1
                ? `Extracting venues — ${shown.completed}/${shown.total} done`
                : "Reading page & extracting venues…"
              : `Done — ${shown.added} added${shown.duplicate ? `, ${shown.duplicate} already had` : ""}${
                  shown.failed ? `, ${shown.failed} couldn't scrape` : ""
                }`}
          </p>
          {shown.items.map((item, i) => (
            <VenueRow key={`${item.input}-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
