"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateCampaign, getCampaignEditHistory, addCampaignEditHistory } from "@/lib/firestore-api";
import { useAuth } from "@/lib/auth-context";
import type { Campaign } from "@/lib/types";
import type { CampaignEdit } from "@/lib/firestore-api";

const CAMPAIGN_TYPES = [
  { value: "seasonal",    label: "Seasonal Promo" },
  { value: "reorder",     label: "Reorder Nudge" },
  { value: "new_product", label: "New Product" },
  { value: "new_menu",    label: "New Menu Support" },
  { value: "event",       label: "Event / Collaboration" },
];

const ALL_PRODUCTS = [
  "Asterley Original", "Schofield's", "Rosé", "Dispense", "Estate", "Britannica",
];

const FIELD_LABELS: Record<string, string> = {
  name:          "Name",
  campaign_type: "Type",
  lead_product:  "Product",
  season:        "Season",
  timeframe:     "Timeframe",
  send_date:     "Send date",
  notes:         "Notes",
};

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function HistoryTab({ history }: { history: CampaignEdit[] }) {
  if (history.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        No edits recorded yet.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border/40 max-h-96 overflow-y-auto">
      {history.map((edit) => (
        <div key={edit.id} className="px-5 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-foreground">{edit.edited_by_name}</span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(edit.edited_at).toLocaleString("en-GB", {
                day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </span>
          </div>
          <div className="space-y-1">
            {Object.entries(edit.changes).map(([field, { before, after }]) => (
              <div key={field} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70 shrink-0">
                  {FIELD_LABELS[field] ?? field}:
                </span>
                <span className="truncate line-through opacity-60">{String(before ?? "—")}</span>
                <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 opacity-50" />
                <span className="truncate">{String(after ?? "—")}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  campaign: Campaign;
  onClose: () => void;
}

export function CampaignEditDialog({ campaign, onClose }: Props) {
  const { user, displayName } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"edit" | "history">("edit");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name:          campaign.name ?? "",
    campaign_type: campaign.campaign_type,
    lead_product:  campaign.lead_product,
    season:        campaign.season ?? "",
    timeframe:     campaign.timeframe ?? "",
    send_date:     campaign.send_date ?? "",
    notes:         campaign.notes ?? "",
  });

  const { data: history = [] } = useQuery({
    queryKey: ["campaignEdits", campaign.id],
    queryFn:  () => getCampaignEditHistory(campaign.id),
    enabled:  tab === "history",
  });

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      const updates: Partial<Campaign> = {};

      function track(
        key: keyof typeof form,
        before: unknown,
        after: unknown,
        nullable = true
      ) {
        const b = before ?? null;
        const a = (nullable ? after || null : after) ?? null;
        if (b !== a) {
          changes[key] = { before: b, after: a };
          (updates as Record<string, unknown>)[key] = a;
        }
      }

      track("name",          campaign.name,          form.name.trim());
      track("campaign_type", campaign.campaign_type,  form.campaign_type, false);
      track("lead_product",  campaign.lead_product,   form.lead_product, false);
      track("season",        campaign.season,         form.season.trim());
      track("timeframe",     campaign.timeframe,      form.timeframe.trim());
      track("send_date",     campaign.send_date,      form.send_date.trim());
      track("notes",         campaign.notes,          form.notes.trim());

      if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }

      await updateCampaign(campaign.id, updates);
      await addCampaignEditHistory(
        campaign.id,
        changes,
        user?.uid ?? "unknown",
        displayName ?? user?.email ?? "Unknown"
      );

      qc.invalidateQueries({ queryKey: ["campaigns"] });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-lg rounded-lg border border-border/50 bg-card shadow-2xl mb-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold">{campaign.name || campaign.lead_product}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Campaign details</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/50 px-5">
          {(["edit", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2.5 mr-5 text-xs font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "history" ? "Edit history" : "Details"}
            </button>
          ))}
        </div>

        {tab === "edit" ? (
          <>
            <div className="px-5 py-4 space-y-3.5">
              <Field label="Campaign name">
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={set("name")}
                  placeholder="e.g. Summer Rooftop Push"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select className={inputCls} value={form.campaign_type} onChange={set("campaign_type")}>
                    {CAMPAIGN_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Product focus">
                  <select className={inputCls} value={form.lead_product} onChange={set("lead_product")}>
                    {ALL_PRODUCTS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Season">
                  <input
                    className={inputCls}
                    value={form.season}
                    onChange={set("season")}
                    placeholder="e.g. Summer 2026"
                  />
                </Field>
                <Field label="Send date">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.send_date}
                    onChange={set("send_date")}
                  />
                </Field>
              </div>

              <Field label="Timeframe">
                <input
                  className={inputCls}
                  value={form.timeframe}
                  onChange={set("timeframe")}
                  placeholder="e.g. 22 Apr – 12 May 2026"
                />
              </Field>

              <Field label="Notes">
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={3}
                  value={form.notes}
                  onChange={set("notes")}
                  placeholder="Internal notes about this campaign…"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-border/50 px-5 py-3">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Saving…</>
                ) : "Save changes"}
              </Button>
            </div>
          </>
        ) : (
          <HistoryTab history={history} />
        )}
      </div>
    </div>
  );
}
