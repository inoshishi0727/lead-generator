"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClients } from "@/lib/firestore-api";
import {
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useApproveCampaign,
  useGenerateClientDrafts,
} from "@/hooks/use-outreach";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Plus,
  Loader2,
  CheckSquare,
  Square,
  ExternalLink,
  ChevronLeft,
  Sparkles,
  Star,
  MessageSquare,
  Pencil,
  Check,
  X,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import type { Lead, Campaign } from "@/lib/types";

const CAMPAIGN_TYPES = [
  { value: "seasonal", label: "Seasonal Promo", hint: "Timely product and serve angle tied to the current season" },
  { value: "reorder", label: "Reorder Nudge", hint: "Stock check-in before seasonal demand picks up" },
  { value: "new_product", label: "New Product", hint: "Early access framing for trusted stockists" },
  { value: "new_menu", label: "New Menu Support", hint: "Offer to help refresh their menu listing or develop a new serve" },
  { value: "event", label: "Event / Collaboration", hint: "Propose a tasting, pop-up, or featured serve" },
];

type SendMode = "recommended" | "all" | "custom";

export default function CampaignsPage() {
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [showNewCampaign, setShowNewCampaign] = useState(false);

  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: getClients });
  const { data: campaigns = [], isLoading } = useCampaigns();

  const syncedActive = activeCampaign
    ? (campaigns.find((c) => c.id === activeCampaign.id) ?? activeCampaign)
    : null;

  if (syncedActive) {
    return (
      <CampaignDetailView
        campaign={syncedActive}
        clients={clients}
        onBack={() => setActiveCampaign(null)}
      />
    );
  }

  const drafts = campaigns.filter((c) => c.status === "draft");
  const active = campaigns.filter((c) => c.status === "active");
  const completed = campaigns.filter((c) => c.status === "completed");

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${campaigns.length} campaign${campaigns.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => setShowNewCampaign(true)} size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Campaign
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="py-12 text-center text-muted-foreground">
          <Sparkles className="mx-auto mb-3 h-8 w-8 opacity-30" />
          <p className="text-sm">No campaigns yet.</p>
          <p className="mt-1 text-xs">Create one to generate targeted outreach for your clients.</p>
        </Card>
      ) : (
        <>
          {drafts.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Pending Review
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {drafts.map((c) => (
                  <CampaignCard key={c.id} campaign={c} onClick={() => setActiveCampaign(c)} />
                ))}
              </div>
            </section>
          )}
          {active.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Active
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((c) => (
                  <CampaignCard key={c.id} campaign={c} onClick={() => setActiveCampaign(c)} />
                ))}
              </div>
            </section>
          )}
          {completed.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Completed
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {completed.map((c) => (
                  <CampaignCard key={c.id} campaign={c} onClick={() => setActiveCampaign(c)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {showNewCampaign && (
        <NewCampaignModal
          onClose={() => setShowNewCampaign(false)}
          onCreated={(campaign) => {
            setShowNewCampaign(false);
            setActiveCampaign(campaign);
          }}
        />
      )}
    </div>
  );
}

// ---- Campaign card ----

function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const typeLabel = CAMPAIGN_TYPES.find((t) => t.value === campaign.campaign_type)?.label ?? campaign.campaign_type;
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border bg-card p-4 text-left hover:bg-accent/30 transition-colors ${
        campaign.status === "draft"
          ? "border-amber-500/30 hover:border-amber-500/50"
          : "border-border/60 hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
          {campaign.status === "draft" && (
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
              Draft
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{campaign.season}</span>
      </div>
      <p className="text-xs font-semibold mb-1">{campaign.lead_product}</p>
      {campaign.timeframe && (
        <p className="text-[11px] text-muted-foreground mb-1">{campaign.timeframe}</p>
      )}
      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{campaign.brief}</p>
      <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border/40">
        {campaign.recommended_lead_ids.length} recommended client{campaign.recommended_lead_ids.length !== 1 ? "s" : ""}
      </p>
    </button>
  );
}

// ---- Campaign detail view ----

type EditableField = "brief" | "type" | "timeframe" | "notes" | null;

function CampaignDetailView({
  campaign,
  clients,
  onBack,
}: {
  campaign: Campaign;
  clients: Lead[];
  onBack: () => void;
}) {
  const [sendMode, setSendMode] = useState<SendMode>("recommended");
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<EditableField>(null);
  const [draftBrief, setDraftBrief] = useState(campaign.brief);
  const [draftType, setDraftType] = useState(campaign.campaign_type);
  const [draftTimeframe, setDraftTimeframe] = useState(campaign.timeframe ?? "");
  const [draftNotes, setDraftNotes] = useState(campaign.notes ?? "");

  const generateMutation = useGenerateClientDrafts();
  const updateMutation = useUpdateCampaign();
  const approveMutation = useApproveCampaign();

  const typeLabel = CAMPAIGN_TYPES.find((t) => t.value === campaign.campaign_type)?.label ?? campaign.campaign_type;
  const recommendedSet = new Set(campaign.recommended_lead_ids);
  const isDraft = campaign.status === "draft";

  const targetIds = useMemo(() => {
    if (sendMode === "all") return clients.map((c) => c.id);
    if (sendMode === "recommended") return campaign.recommended_lead_ids;
    return customIds;
  }, [sendMode, clients, campaign.recommended_lead_ids, customIds]);

  const displayedClients = useMemo(() => {
    const sorted = [...clients].sort(
      (a, b) => (recommendedSet.has(a.id) ? 0 : 1) - (recommendedSet.has(b.id) ? 0 : 1)
    );
    return sendMode === "recommended" ? sorted.filter((c) => recommendedSet.has(c.id)) : sorted;
  }, [clients, sendMode, recommendedSet]);

  function toggleCustom(id: string) {
    setCustomIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function saveField(field: EditableField, value: string) {
    const trimmed = value.trim();
    const updates: Partial<Campaign> = {};
    if (field === "brief") updates.brief = trimmed;
    if (field === "type") updates.campaign_type = trimmed;
    if (field === "timeframe") updates.timeframe = trimmed || null;
    if (field === "notes") updates.notes = trimmed || null;
    await updateMutation.mutateAsync({ id: campaign.id, ...updates });
    setEditing(null);
    toast.success("Updated");
  }

  function handleApprove() {
    toast.promise(
      approveMutation.mutateAsync(campaign.id),
      {
        loading: "Approving campaign…",
        success: "Campaign approved and now active",
        error: "Failed to approve campaign",
      }
    );
  }

  function handleGenerate() {
    if (targetIds.length === 0) { toast.error("No clients selected"); return; }
    toast.promise(
      new Promise((resolve, reject) => {
        generateMutation.mutate(
          { lead_ids: targetIds, campaign_id: campaign.id },
          { onSuccess: resolve, onError: reject }
        );
      }),
      {
        loading: "Generating drafts…",
        success: (data: any) =>
          `${data.generated} draft${data.generated !== 1 ? "s" : ""} generated — review them in Outreach`,
        error: "Draft generation failed",
      }
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="mt-1 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          {editing === "type" ? (
            <InlineSelect
              value={draftType}
              options={CAMPAIGN_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              onChange={setDraftType}
              onSave={() => saveField("type", draftType)}
              onCancel={() => { setEditing(null); setDraftType(campaign.campaign_type); }}
              saving={updateMutation.isPending}
            />
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight">{typeLabel}</h1>
              <Badge variant="secondary" className="text-[10px]">{campaign.season}</Badge>
              {isDraft && (
                <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">Draft</Badge>
              )}
              {campaign.extra_context && (
                <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400">custom context</Badge>
              )}
              <EditButton onClick={() => setEditing("type")} />
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">{campaign.lead_product} — {campaign.hook}</p>
        </div>
      </div>

      {/* Draft approval banner */}
      {isDraft && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">This campaign is pending review</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review the details below, make any edits, then approve to make it active.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {approveMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Approve Campaign
            </Button>
          </div>
        </Card>
      )}

      {/* Details card */}
      <Card className="p-4 space-y-4">
        {/* Timeframe */}
        <DetailRow
          label="Timeframe"
          editing={editing === "timeframe"}
          onEdit={() => { setEditing("timeframe"); setDraftTimeframe(campaign.timeframe ?? ""); }}
        >
          {editing === "timeframe" ? (
            <InlineInput
              value={draftTimeframe}
              onChange={setDraftTimeframe}
              placeholder="e.g. 22 Apr – 12 May 2026"
              onSave={() => saveField("timeframe", draftTimeframe)}
              onCancel={() => { setEditing(null); setDraftTimeframe(campaign.timeframe ?? ""); }}
              saving={updateMutation.isPending}
            />
          ) : (
            <span className="text-sm">{campaign.timeframe || <span className="text-muted-foreground">Not set</span>}</span>
          )}
        </DetailRow>

        {/* Lead product + serve */}
        <DetailRow label="Product focus">
          <span className="text-sm">{campaign.lead_product} — {campaign.serve}</span>
        </DetailRow>

        {/* Hook */}
        <DetailRow label="Hook">
          <span className="text-sm">{campaign.hook}</span>
        </DetailRow>

        {/* Notes */}
        <DetailRow
          label="Internal notes"
          editing={editing === "notes"}
          onEdit={() => { setEditing("notes"); setDraftNotes(campaign.notes ?? ""); }}
        >
          {editing === "notes" ? (
            <InlineTextarea
              value={draftNotes}
              onChange={setDraftNotes}
              placeholder="Any internal notes about this campaign…"
              rows={3}
              onSave={() => saveField("notes", draftNotes)}
              onCancel={() => { setEditing(null); setDraftNotes(campaign.notes ?? ""); }}
              saving={updateMutation.isPending}
            />
          ) : (
            <span className="text-sm text-muted-foreground">
              {campaign.notes || "None"}
            </span>
          )}
        </DetailRow>
      </Card>

      {/* Brief */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">Campaign brief</p>
          {editing !== "brief" && (
            <EditButton onClick={() => { setEditing("brief"); setDraftBrief(campaign.brief); }} />
          )}
        </div>
        {editing === "brief" ? (
          <div className="space-y-2">
            <textarea
              value={draftBrief}
              onChange={(e) => setDraftBrief(e.target.value)}
              rows={10}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditing(null); setDraftBrief(campaign.brief); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => saveField("brief", draftBrief)} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{campaign.brief}</p>
        )}
      </Card>

      {/* Send mode — only for active campaigns */}
      {!isDraft && (
        <>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Generate drafts for</p>
            <div className="flex gap-2 flex-wrap">
              {(["recommended", "all", "custom"] as SendMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSendMode(mode)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    sendMode === mode
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {mode === "recommended"
                    ? `Recommended (${campaign.recommended_lead_ids.length})`
                    : mode === "all"
                    ? `All clients (${clients.length})`
                    : `Custom${customIds.length > 0 ? ` (${customIds.length})` : ""}`}
                </button>
              ))}
            </div>
          </div>

          {displayedClients.length === 0 ? (
            <Card className="py-10 text-center text-muted-foreground">
              <Building2 className="mx-auto mb-3 h-7 w-7 opacity-30" />
              <p className="text-sm">
                {sendMode === "recommended" ? "No recommended clients for this campaign." : "No clients yet."}
              </p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {displayedClients.map((client) => {
                const isRecommended = recommendedSet.has(client.id);
                const isSelected = sendMode === "custom" ? customIds.includes(client.id) : undefined;
                return (
                  <ClientCard
                    key={client.id}
                    client={client}
                    isRecommended={isRecommended}
                    selectable={sendMode === "custom"}
                    selected={isSelected}
                    onSelect={() => toggleCustom(client.id)}
                  />
                );
              })}
            </div>
          )}

          <div className="sticky bottom-4 flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending || targetIds.length === 0}
              size="sm"
              className="shadow-lg"
            >
              {generateMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              )}
              Generate {targetIds.length > 0 ? `${targetIds.length} ` : ""}Draft{targetIds.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </>
      )}

      {isDraft && (
        <p className="text-xs text-muted-foreground text-center pb-4">
          Approve the campaign above to unlock draft generation.
        </p>
      )}
    </div>
  );
}

// ---- Small reusable edit components ----

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-muted-foreground hover:text-foreground transition-colors">
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}

function DetailRow({
  label,
  children,
  editing,
  onEdit,
}: {
  label: string;
  children: React.ReactNode;
  editing?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-32 shrink-0 text-xs text-muted-foreground pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
      {onEdit && !editing && <EditButton onClick={onEdit} />}
    </div>
  );
}

function InlineInput({
  value,
  onChange,
  placeholder,
  onSave,
  onCancel,
  saving,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
        onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
        autoFocus
      />
      <button onClick={onSave} disabled={saving} className="text-emerald-400 hover:text-emerald-300 transition-colors">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function InlineTextarea({
  value,
  onChange,
  placeholder,
  rows,
  onSave,
  onCancel,
  saving,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows ?? 3}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm resize-none"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

function InlineSelect({
  value,
  options,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button onClick={onSave} disabled={saving} className="text-emerald-400 hover:text-emerald-300 transition-colors">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---- New Campaign modal ----

function NewCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (campaign: Campaign) => void;
}) {
  const [campaignType, setCampaignType] = useState("seasonal");
  const [showSuggest, setShowSuggest] = useState(false);
  const [extraContext, setExtraContext] = useState("");
  const createMutation = useCreateCampaign();

  function handleCreate() {
    toast.promise(
      new Promise<Campaign>((resolve, reject) => {
        createMutation.mutate(
          { campaign_type: campaignType, extra_context: extraContext.trim() || undefined },
          { onSuccess: resolve, onError: reject }
        );
      }),
      {
        loading: "Creating campaign…",
        success: (campaign: Campaign) => {
          onCreated(campaign);
          return `Campaign draft created — review and approve to make it active`;
        },
        error: "Failed to create campaign",
      }
    );
  }

  const hint = CAMPAIGN_TYPES.find((t) => t.value === campaignType)?.hint;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-lg border border-border/50 bg-card p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold">New Campaign</h2>

        <label className="mb-1 block text-xs font-medium text-muted-foreground">Campaign type</label>
        <select
          value={campaignType}
          onChange={(e) => setCampaignType(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {CAMPAIGN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {hint && <p className="mb-4 mt-1.5 text-xs text-muted-foreground">{hint}</p>}

        <div className="mb-5">
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowSuggest((v) => !v)}
          >
            <Sparkles className="h-3 w-3" />
            {showSuggest ? "Hide suggestion" : "Add a suggestion"}
          </button>
          {showSuggest && (
            <textarea
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              placeholder="Any extra context — e.g. 'focus on venues that do Sunday brunch' or 'we have low stock of Schofield's'"
              rows={3}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 resize-none"
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={createMutation.isPending} onClick={handleCreate}>
            {createMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Create Campaign
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Client card ----

function ClientCard({
  client,
  isRecommended,
  selectable,
  selected,
  onSelect,
}: {
  client: Lead;
  isRecommended?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Card
      className={`p-4 space-y-2 transition-colors ${
        selectable
          ? selected
            ? "border-primary/60 bg-primary/5 cursor-pointer"
            : "cursor-pointer hover:border-border hover:bg-accent/20"
          : ""
      }`}
      onClick={selectable ? onSelect : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {selectable && (
              selected
                ? <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                : <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <p className="font-semibold truncate text-sm">{client.business_name}</p>
          </div>
          {client.location_area && (
            <p className="text-xs text-muted-foreground truncate">{client.location_area}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {isRecommended && (
            <Badge className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Star className="mr-0.5 h-2.5 w-2.5" />
              Recommended
            </Badge>
          )}
          {client.stage === "converted" ? (
            <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
              converted
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400 bg-purple-500/10">
              client
            </Badge>
          )}
        </div>
      </div>
      {client.venue_category && (
        <Badge variant="secondary" className="text-[10px] capitalize">
          {client.venue_category.replace(/_/g, " ")}
        </Badge>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {client.email && <span className="truncate">{client.email}</span>}
        {client.website && (
          <a
            href={client.website}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </Card>
  );
}
