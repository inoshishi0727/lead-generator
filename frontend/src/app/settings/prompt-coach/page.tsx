"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Save,
  Trash2,
  Calendar,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  useActiveOperatorOverlay,
  useOperatorOverlayVersions,
  useSaveOperatorOverlay,
  useSetOperatorOverlay,
  useClearOperatorOverlay,
} from "@/hooks/use-operator-overlay";
import { SimulatePanel } from "@/components/simulate-panel";
import { CoachChatPanel } from "@/components/coach-chat-panel";
import type { CoachEnvelope } from "@/hooks/use-coach-chat";
import { useCreateChangeRequest } from "@/hooks/use-change-requests";

export default function PromptCoachPage() {
  const { isAdmin, isMember, loading } = useAuth();
  const { active, loading: activeLoading } = useActiveOperatorOverlay();
  const { data: versions = [] } = useOperatorOverlayVersions();
  const save = useSaveOperatorOverlay();
  const setActive = useSetOperatorOverlay();
  const clear = useClearOperatorOverlay();
  const escalate = useCreateChangeRequest();

  const [label, setLabel] = useState("");
  const [overlayMd, setOverlayMd] = useState("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");

  if (loading) return <div className="p-6">Loading…</div>;
  if (!isAdmin && !isMember) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-700 dark:text-red-400">
          Operator or admin access required.
        </p>
      </div>
    );
  }

  async function handleSave(activate: boolean, scheduled = false) {
    if (!label.trim() || !overlayMd.trim()) {
      toast.warning("Label and overlay text are both required.");
      return;
    }
    try {
      const { version_id } = await save.mutateAsync({
        label: label.trim(),
        overlay_md: overlayMd.trim(),
      });
      if (activate) {
        await setActive.mutateAsync({
          version_id,
          schedule: scheduled && scheduleStart && scheduleEnd
            ? { start: scheduleStart, end: scheduleEnd }
            : undefined,
        });
        toast.success(scheduled ? "Saved and scheduled." : "Saved and activated.");
      } else {
        toast.success("Saved.");
      }
      setLabel("");
      setOverlayMd("");
      setScheduleStart("");
      setScheduleEnd("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function activate(versionId: string) {
    try {
      await setActive.mutateAsync({ version_id: versionId });
      toast.success("Overlay activated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Activate failed.");
    }
  }

  async function handleClear() {
    if (!confirm("Clear the active overlay?")) return;
    try {
      await clear.mutateAsync();
      toast.success("Overlay cleared.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clear failed.");
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Marlow
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The Cellar Master. Adds timely context (weather, events, monthly angle) to every email Claude generates.
          This sits below the base prompt and never overrides voice, structure, or product rules.
        </p>
      </div>

      {/* Marlow chat */}
      <CoachChatPanel
        onProposeOverlay={(md) => setOverlayMd(md)}
        onSimulate={(md) => {
          setOverlayMd(md);
          toast.info("Loaded into the editor. Hit Simulate below to preview.");
        }}
        onApplyOverlay={async (md) => {
          if (!label.trim()) {
            setLabel("Marlow draft");
          }
          setOverlayMd(md);
          try {
            const { version_id } = await save.mutateAsync({
              label: label.trim() || "Marlow draft",
              overlay_md: md,
              source: "prompt_coach",
            });
            await setActive.mutateAsync({ version_id });
            toast.success("Marlow applied the overlay.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Apply failed.");
          }
        }}
        onSaveAndSchedule={(md) => {
          setOverlayMd(md);
          toast.info("Loaded into the editor. Set a date range and click Save and schedule.");
        }}
        onEscalate={async (payload: NonNullable<CoachEnvelope["escalation_payload"]>) => {
          try {
            await escalate.mutateAsync({
              request: payload.request,
              agent_reason: payload.agent_reason,
              proposed_edit: payload.proposed_edit,
              target_layer: payload.target_layer,
            });
            toast.success("Sent to Rob. He'll review the change request.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Escalation failed.");
          }
        }}
      />

      {/* Active overlay card */}
      <div className="rounded-lg border border-border/50 bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <h2 className="font-semibold text-sm">Active overlay</h2>
        </div>
        {activeLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : active ? (
          <div>
            <p className="text-sm font-medium">{active.label}</p>
            <p className="text-[11px] text-muted-foreground mb-2">
              Created {new Date(active.created_at).toLocaleString()} · source: {active.source}
            </p>
            <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">{active.overlay_md}</pre>
            <button
              type="button"
              onClick={handleClear}
              disabled={clear.isPending}
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-red-600/50 bg-red-500/15 px-2 py-1 text-xs font-medium text-red-900 hover:bg-red-500/25 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 disabled:opacity-50"
            >
              <Trash2 size={12} />
              Clear overlay
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No overlay active. Emails generate against the base recipe only.
          </p>
        )}
      </div>

      {/* Editor */}
      <div className="rounded-lg border border-border/50 bg-card p-4">
        <h2 className="font-semibold text-sm mb-3">New overlay</h2>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Label
            </label>
            <input
              type="text"
              placeholder="e.g. June Heatwave — Spritz Push"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Overlay (markdown)
            </label>
            <textarea
              rows={6}
              placeholder="- SEASONAL EMPHASIS (this week): UK heatwave. Lead with long, refreshing spritz serves."
              value={overlayMd}
              onChange={(e) => setOverlayMd(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Bullet style with CAPITAL HEADERS works best. Keep to 4-6 lines.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Schedule start (optional)
              </label>
              <input
                type="date"
                value={scheduleStart}
                onChange={(e) => setScheduleStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Schedule end (optional)
              </label>
              <input
                type="date"
                value={scheduleEnd}
                onChange={(e) => setScheduleEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={save.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              <Save size={12} />
              Save only
            </button>
            <button
              type="button"
              onClick={() => handleSave(true, false)}
              disabled={save.isPending || setActive.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {save.isPending || setActive.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CheckCircle2 size={12} />
              )}
              Save and activate
            </button>
            <button
              type="button"
              onClick={() => handleSave(true, true)}
              disabled={
                save.isPending ||
                setActive.isPending ||
                !scheduleStart ||
                !scheduleEnd
              }
              className="inline-flex items-center gap-1 rounded-md border border-amber-600/50 bg-amber-500/15 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-500/25 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20 disabled:opacity-50"
              title={
                !scheduleStart || !scheduleEnd
                  ? "Set a start and end date to schedule."
                  : "Schedule this overlay to activate within the date range."
              }
            >
              <Calendar size={12} />
              Save and schedule
            </button>
          </div>
        </div>
      </div>

      {/* Simulate panel */}
      <SimulatePanel
        proposedOverlayMd={overlayMd}
        baselineOverlayMd={active?.overlay_md ?? ""}
      />

      {/* Saved overlays — first 4 only, with See all link to the dedicated page */}
      <div className="rounded-lg border border-border/50 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-sm">Saved overlays ({versions.length})</h2>
          <Link
            href="/settings/prompt-coach/versions"
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            See all{versions.length > 4 ? ` ${versions.length}` : ""}
          </Link>
        </div>
        {versions.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No versions saved yet.</p>
        ) : (
          <ul className="space-y-2">
            {versions.slice(0, 4).map((v) => (
              <li
                key={v.version_id}
                className="flex items-start gap-3 rounded-md border border-border/40 bg-muted/20 p-3"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/settings/prompt-coach/versions#${v.version_id}`}
                    className="font-medium text-sm hover:underline"
                  >
                    {v.label}
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    Created {new Date(v.created_at).toLocaleString()} · source: {v.source}
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {v.overlay_md.slice(0, 240)}
                    {v.overlay_md.length > 240 ? "…" : ""}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={() => activate(v.version_id)}
                  disabled={
                    setActive.isPending || active?.version_id === v.version_id
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-600/50 bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-500/25 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {active?.version_id === v.version_id ? "Active" : "Activate"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
