"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClientEditHistory, saveClientEdit } from "@/lib/firestore-api";
import { getTeamMembers } from "@/lib/auth-admin";
import { useAuth } from "@/lib/auth-context";
import type { Lead } from "@/lib/types";
import type { ClientEdit } from "@/lib/firestore-api";

const VENUE_CATEGORIES = [
  "cocktail_bar", "wine_bar", "pub", "brewery_taproom", "gastropub",
  "italian_restaurant", "hotel_bar", "restaurant_groups", "bottle_shop",
  "deli", "farm_shop", "events_catering", "festival", "cookery_school",
  "corporate_gifting", "membership_club", "airline", "luxury_retail", "grocery",
];

const FIELD_LABELS: Record<string, string> = {
  business_name: "Business name",
  contact_name: "Contact",
  contact_role: "Role",
  contact_email: "Email",
  phone: "Phone",
  website: "Website",
  address: "Address",
  venue_category: "Category",
  notes: "Notes",
  assigned_to_name: "Owner",
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

function HistoryTab({ history }: { history: ClientEdit[] }) {
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
            {Object.entries(edit.changes)
              .filter(([k]) => k !== "assigned_to")
              .map(([field, { before, after }]) => (
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
  client: Lead;
  onClose: () => void;
}

export function ClientEditDialog({ client, onClose }: Props) {
  const { workspaceId, user, displayName } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"edit" | "history">("edit");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    business_name: client.business_name ?? "",
    contact_name: client.contact_name ?? "",
    contact_role: client.contact_role ?? "",
    contact_email: client.contact_email ?? "",
    phone: client.phone ?? "",
    website: client.website ?? "",
    address: client.address ?? "",
    venue_category: client.venue_category ?? "",
    notes: ((client as unknown) as Record<string, unknown>).client_notes as string ?? "",
    assigned_to: client.assigned_to ?? "",
    assigned_to_name: client.assigned_to_name ?? "",
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["teamMembers", workspaceId],
    queryFn: () => getTeamMembers(workspaceId ?? ""),
  });

  const { data: history = [] } = useQuery({
    queryKey: ["clientEdits", client.id],
    queryFn: () => getClientEditHistory(client.id),
    enabled: tab === "history",
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
      const firestoreUpdates: Record<string, unknown> = {};
      const changes: Record<string, { before: unknown; after: unknown }> = {};

      function track(
        histKey: string,
        firestoreKey: string,
        before: unknown,
        after: unknown
      ) {
        const b = before ?? null;
        const a = after ?? null;
        if (b !== a) {
          firestoreUpdates[firestoreKey] = a;
          changes[histKey] = { before: b, after: a };
        }
      }

      track("business_name",  "business_name",             client.business_name,   form.business_name.trim() || null);
      track("contact_name",   "contact_name",              client.contact_name,    form.contact_name.trim() || null);
      track("contact_role",   "contact_role",              client.contact_role,    form.contact_role.trim() || null);
      track("contact_email",  "contact_email",             client.contact_email,   form.contact_email.trim() || null);
      track("phone",          "phone",                     client.phone,           form.phone.trim() || null);
      track("website",        "website",                   client.website,         form.website.trim() || null);
      track("address",        "address",                   client.address,         form.address.trim() || null);
      track("venue_category", "enrichment.venue_category", client.venue_category,  form.venue_category || null);
      track("notes",          "client_notes",              ((client as unknown) as Record<string, unknown>).client_notes ?? null, form.notes.trim() || null);
      track("assigned_to",    "assigned_to",               client.assigned_to,     form.assigned_to || null);
      track("assigned_to_name","assigned_to_name",         client.assigned_to_name, form.assigned_to_name || null);

      if (Object.keys(firestoreUpdates).length === 0) {
        onClose();
        return;
      }

      await saveClientEdit(
        client.id,
        firestoreUpdates,
        changes,
        user?.uid ?? "unknown",
        displayName ?? user?.email ?? "Unknown"
      );

      qc.invalidateQueries({ queryKey: ["clients"] });
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
            <h2 className="text-sm font-semibold">{client.business_name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Client details</p>
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
              <Field label="Business name">
                <input className={inputCls} value={form.business_name} onChange={set("business_name")} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact name">
                  <input className={inputCls} value={form.contact_name} onChange={set("contact_name")} placeholder="Full name" />
                </Field>
                <Field label="Role">
                  <input className={inputCls} value={form.contact_role} onChange={set("contact_role")} placeholder="e.g. Buyer" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact email">
                  <input className={inputCls} type="email" value={form.contact_email} onChange={set("contact_email")} placeholder="email@venue.com" />
                </Field>
                <Field label="Phone">
                  <input className={inputCls} type="tel" value={form.phone} onChange={set("phone")} placeholder="+44 …" />
                </Field>
              </div>

              <Field label="Website">
                <input className={inputCls} value={form.website} onChange={set("website")} placeholder="https://…" />
              </Field>

              <Field label="Address">
                <input className={inputCls} value={form.address} onChange={set("address")} placeholder="Street, City, Postcode" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <select
                    className={inputCls}
                    value={form.venue_category}
                    onChange={set("venue_category")}
                  >
                    <option value="">— none —</option>
                    {VENUE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Account owner">
                  <select
                    className={inputCls}
                    value={form.assigned_to}
                    onChange={(e) => {
                      const m = teamMembers.find((m) => m.uid === e.target.value);
                      setForm((f) => ({
                        ...f,
                        assigned_to: e.target.value,
                        assigned_to_name: m?.display_name ?? m?.email ?? "",
                      }));
                    }}
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.display_name || m.email}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Notes">
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={3}
                  value={form.notes}
                  onChange={set("notes")}
                  placeholder="Internal notes about this client…"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-border/50 px-5 py-3">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
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
