"use client";

import { useState } from "react";
import { Loader2, Play, FileText } from "lucide-react";
import { toast } from "sonner";
import { useLeads } from "@/hooks/use-leads";
import { useSimulateDraft, type SimulateDraftResult } from "@/hooks/use-operator-overlay";

interface Props {
  /** The overlay text Alex is currently editing. Passed in so simulation uses
   *  the live in-progress overlay, not whatever is saved to Firestore. */
  proposedOverlayMd: string;
  /** The currently-active overlay text (for the baseline column). May be ""
   *  when nothing is active. */
  baselineOverlayMd: string;
}

/**
 * Simulate a draft against a real lead. Renders two columns: baseline (current
 * active overlay) and proposed (the edit Alex is working on). No writes; no
 * sends; the simulateDraft callable writes nothing to outreach_messages or
 * generation_log. Pure preview.
 */
export function SimulatePanel({ proposedOverlayMd, baselineOverlayMd }: Props) {
  const { data: allLeads = [] } = useLeads();
  const simulate = useSimulateDraft();
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [baseline, setBaseline] = useState<SimulateDraftResult | null>(null);
  const [proposed, setProposed] = useState<SimulateDraftResult | null>(null);
  const [running, setRunning] = useState(false);

  // Only enriched + scored leads are candidates — same eligibility as real
  // generation. Top 20 matches keep the picker fast.
  const eligible = allLeads
    .filter((l) => l.email && (l.enrichment_status === "success" || l.score != null))
    .filter((l) =>
      search.trim()
        ? (l.business_name || "").toLowerCase().includes(search.toLowerCase()) ||
          (l.venue_category || "").toLowerCase().includes(search.toLowerCase())
        : true,
    )
    .slice(0, 20);

  async function runSimulation() {
    if (!selectedLeadId) {
      toast.warning("Pick a lead first.");
      return;
    }
    setRunning(true);
    setBaseline(null);
    setProposed(null);
    try {
      const [base, prop] = await Promise.all([
        simulate.mutateAsync({ lead_id: selectedLeadId, overlay_md: baselineOverlayMd }),
        simulate.mutateAsync({ lead_id: selectedLeadId, overlay_md: proposedOverlayMd }),
      ]);
      setBaseline(base);
      setProposed(prop);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Simulation failed. Try again.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Simulate against a real lead</h3>
        <span className="text-xs text-muted-foreground">
          Dry run. Nothing is written or sent.
        </span>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          placeholder="Search venue name or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
        <select
          value={selectedLeadId}
          onChange={(e) => setSelectedLeadId(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs min-w-48"
        >
          <option value="">Pick a lead…</option>
          {eligible.map((l) => (
            <option key={l.id} value={l.id}>
              {l.business_name || "(unnamed)"}
              {l.venue_category ? ` — ${l.venue_category.replace(/_/g, " ")}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={runSimulation}
          disabled={running || !selectedLeadId}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {running ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          Simulate
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SimColumn title="Baseline (current overlay)" result={baseline} running={running} />
        <SimColumn title="Proposed overlay" result={proposed} running={running} highlight />
      </div>
    </div>
  );
}

function SimColumn({
  title,
  result,
  running,
  highlight,
}: {
  title: string;
  result: SimulateDraftResult | null;
  running: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border p-3 " +
        (highlight ? "border-indigo-400/40 bg-indigo-500/5" : "border-border/50 bg-muted/20")
      }
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {running ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Generating…
        </div>
      ) : result ? (
        <div className="space-y-2 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Subject</p>
            <p className="font-medium">{result.subject || "(empty)"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Body</p>
            <pre className="whitespace-pre-wrap font-sans">{result.content}</pre>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Run Simulate to see the draft.
        </p>
      )}
    </div>
  );
}
