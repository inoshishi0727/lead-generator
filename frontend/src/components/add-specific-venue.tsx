"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useScrapeOne } from "@/hooks/use-scrape-one";

/**
 * Client-facing single-venue scrape: paste a Google Maps URL, website,
 * or just a venue name → POSTs to /api/scrape-one → returns the lead
 * synchronously (~15-45 s).
 *
 * Kept deliberately compact for the dashboard. Toasts (handled by the hook)
 * carry success/error feedback so this component doesn't need its own state.
 */
export function AddSpecificVenue() {
  const [value, setValue] = useState("");
  const mutation = useScrapeOne();
  const busy = mutation.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    mutation.mutate(trimmed, {
      onSuccess: () => setValue(""),
    });
  };

  return (
    <form onSubmit={onSubmit} className="sp-add-venue">
      <input
        type="text"
        placeholder="Add venue: paste Maps link, website, or name (auto-enriches)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="sp-add-venue-input"
        aria-label="Add a specific venue"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="sp-btn primary"
      >
        {busy ? (
          <>
            <Loader2 size={13} className="sp-spin" />
            Scraping…
          </>
        ) : (
          <>
            <Plus size={13} />
            Add venue
          </>
        )}
      </button>
    </form>
  );
}
