"use client";

import { useState } from "react";
import { Plus, Loader2, Globe } from "lucide-react";
import { useQuickAdd } from "@/hooks/use-quick-add";
import { useScrapeUrl } from "@/hooks/use-scrape-url";

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

/**
 * Universal add box. If the input is a website URL (a blog, a "best bars"
 * listicle, or a single venue site) we fetch it, extract every venue via
 * Gemini and enrich each into a lead. Otherwise (a name, a Maps link, plain
 * text) it drops in a skeleton lead to scrape later.
 */
export function AddSpecificVenue() {
  const [value, setValue] = useState("");
  const quickAdd = useQuickAdd();
  const scrapeUrl = useScrapeUrl();

  const urlJob = scrapeUrl.status;
  const urlRunning =
    scrapeUrl.isStarting ||
    (!!urlJob && urlJob.status !== "completed" && urlJob.status !== "failed");
  const busy = quickAdd.isPending || urlRunning;

  const willScrape = isScrapeableUrl(value);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (isScrapeableUrl(trimmed)) {
      scrapeUrl.start(trimmed);
      setValue("");
    } else {
      quickAdd.mutate([trimmed], { onSuccess: () => setValue("") });
    }
  };

  return (
    <div className="space-y-1.5">
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

      {urlJob && urlRunning && (
        <p className="text-xs text-muted-foreground">
          {urlJob.total > 1
            ? `Extracting venues — ${urlJob.completed}/${urlJob.total} done · ${urlJob.added} added`
            : "Reading page & extracting venues…"}
        </p>
      )}
    </div>
  );
}
