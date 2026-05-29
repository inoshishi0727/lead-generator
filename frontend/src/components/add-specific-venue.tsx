"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useQuickAdd } from "@/hooks/use-quick-add";

/**
 * Single-line venue add (no scraping). Inserts a skeleton lead instantly;
 * the user scrapes / enriches later from the Leads page.
 */
export function AddSpecificVenue() {
  const [value, setValue] = useState("");
  const mutation = useQuickAdd();
  const busy = mutation.isPending;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    mutation.mutate([trimmed], {
      onSuccess: () => setValue(""),
    });
  };

  return (
    <form onSubmit={onSubmit} className="sp-add-venue">
      <input
        type="text"
        placeholder="Save a lead: paste a Maps link, website, or name (scrape later)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="sp-add-venue-input"
        aria-label="Add a lead to scrape later"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="sp-btn primary"
      >
        {busy ? (
          <>
            <Loader2 size={13} className="sp-spin" />
            Saving…
          </>
        ) : (
          <>
            <Plus size={13} />
            Save lead
          </>
        )}
      </button>
    </form>
  );
}
