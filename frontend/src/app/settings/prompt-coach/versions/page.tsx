"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Sparkles,
  Search,
  Pencil,
  Save,
  X,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  useActiveOperatorOverlay,
  useOperatorOverlayVersions,
  useSetOperatorOverlay,
  useUpdateOperatorOverlayVersion,
  type OperatorOverlayVersion,
} from "@/hooks/use-operator-overlay";

/**
 * Full list of every saved overlay version. Each row is clickable to expand,
 * editable in place (label + body), and has an Activate button. Search bar at
 * the top filters by label and body text.
 *
 * Edits go through updateOperatorOverlayVersion which mutates the existing
 * version doc in place — no v2/v3 history is kept for now. If we ever want
 * history, we can flip to a copy-on-write model and add a "Previous edits"
 * panel per version.
 */
export default function PromptCoachVersionsPage() {
  const { isAdmin, isMember, loading } = useAuth();
  const { active } = useActiveOperatorOverlay();
  const { data: versions = [], isLoading: versionsLoading } = useOperatorOverlayVersions();
  const setActive = useSetOperatorOverlay();
  const update = useUpdateOperatorOverlayVersion();

  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editOverlay, setEditOverlay] = useState("");

  // Deep-link from main page: /settings/prompt-coach/versions#<version_id>
  // scrolls the matching row into view and pre-expands it for editing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [versions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? versions.filter(
          (v) =>
            v.label.toLowerCase().includes(q) ||
            v.overlay_md.toLowerCase().includes(q),
        )
      : versions;
    // Sort by created_at according to operator choice. Default newest-first
    // since that's almost always what the operator wants when triaging a
    // long list of saved overlays.
    return [...matched].sort((a, b) => {
      const cmp = (b.created_at || "").localeCompare(a.created_at || "");
      return sortOrder === "newest" ? cmp : -cmp;
    });
  }, [versions, search, sortOrder]);

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

  function startEdit(v: OperatorOverlayVersion) {
    setEditingId(v.version_id);
    setEditLabel(v.label);
    setEditOverlay(v.overlay_md);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditOverlay("");
  }

  async function saveEdit(versionId: string) {
    try {
      await update.mutateAsync({
        version_id: versionId,
        label: editLabel,
        overlay_md: editOverlay,
      });
      toast.success("Overlay updated.");
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
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

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div>
        <Link
          href="/settings/prompt-coach"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ChevronLeft size={12} />
          Back to Marlow
        </Link>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Saved overlays
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every overlay you've saved. Click a row to expand and edit, or activate one to push it live.
        </p>
      </div>

      <div className="rounded-lg border border-border/50 bg-card p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Search size={14} className="text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by label or overlay text…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-[11px] text-muted-foreground">Sort</label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {filtered.length} of {versions.length}
        </span>
      </div>

      {versionsLoading ? (
        <p className="text-xs text-muted-foreground italic">Loading saved overlays…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          {versions.length === 0
            ? "No overlays saved yet. Talk to Marlow to draft one."
            : `No overlays match "${search}".`}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((v) => {
            const isEditing = editingId === v.version_id;
            const isActive = active?.version_id === v.version_id;
            return (
              <li
                key={v.version_id}
                id={v.version_id}
                className={
                  "rounded-md border p-3 " +
                  (isActive
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border/40 bg-muted/20")
                }
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-medium"
                      />
                    ) : (
                      <p className="font-medium text-sm">{v.label}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Created {new Date(v.created_at).toLocaleString()} · source: {v.source}
                      {isActive && " · currently active"}
                    </p>
                    {isEditing ? (
                      <textarea
                        rows={6}
                        value={editOverlay}
                        onChange={(e) => setEditOverlay(e.target.value)}
                        className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                      />
                    ) : (
                      <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted-foreground">
                        {v.overlay_md}
                      </pre>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => saveEdit(v.version_id)}
                          disabled={update.isPending}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {update.isPending ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Save size={11} />
                          )}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                        >
                          <X size={11} />
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => activate(v.version_id)}
                          disabled={setActive.isPending || isActive}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-600/50 bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-500/25 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          <CheckCircle2 size={11} />
                          {isActive ? "Active" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(v)}
                          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                        >
                          <Pencil size={11} />
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
