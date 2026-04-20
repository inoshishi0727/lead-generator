"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClients } from "@/lib/firestore-api";
import {
  useCampaigns,
  useCreateCampaign,
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
  ChevronDown,
  ChevronUp,
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

export default function ClientsPage() {
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [showNewCampaign, setShowNewCampaign] = useState(false);

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: getClients,
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useCampaigns();

  return (
    <div className="space-y-6">
      {activeCampaign ? (
        <CampaignDetailView
          campaign={activeCampaign}
          clients={clients}
          onBack={() => setActiveCampaign(null)}
        />
      ) : (
        <DefaultView
          clients={clients}
          campaigns={campaigns}
          clientsLoading={clientsLoading}
          campaignsLoading={campaignsLoading}
          onSelectCampaign={setActiveCampaign}
          onNewCampaign={() => setShowNewCampaign(true)}
        />
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

// ---- Default view: campaigns + client grid ----

function DefaultView({
  clients,
  campaigns,
  clientsLoading,
  campaignsLoading,
  onSelectCampaign,
  onNewCampaign,
}: {
  clients: Lead[];
  campaigns: Campaign[];
  clientsLoading: boolean;
  campaignsLoading: boolean;
  onSelectCampaign: (c: Campaign) => void;
  onNewCampaign: () => void;
}) {
  return (
    <>
      {/* Campaigns section */}
      <div>
        <div className="flex items-end justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-sm text-muted-foreground">
              {campaignsLoading ? "Loading…" : `${campaigns.length} campaign${campaigns.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Button onClick={onNewCampaign} size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Campaign
          </Button>
        </div>

        {campaignsLoading ? (
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-56 shrink-0" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <Card className="py-8 text-center text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-6 w-6 opacity-30" />
            <p className="text-sm">No campaigns yet.</p>
            <p className="mt-1 text-xs">Create one to generate targeted outreach for your clients.</p>
          </Card>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} onClick={() => onSelectCampaign(c)} />
            ))}
          </div>
        )}
      </div>

      {/* Clients section */}
      <div>
        <h2 className="text-base font-semibold mb-3">
          Clients
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {clientsLoading ? "" : `${clients.length} active`}
          </span>
        </h2>

        {clientsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <Card className="py-12 text-center text-muted-foreground">
            <Building2 className="mx-auto mb-3 h-8 w-8 opacity-30" />
            <p className="text-sm">No clients yet.</p>
            <p className="mt-1 text-xs">
              Mark a lead as a client using the{" "}
              <Building2 className="inline h-3 w-3" /> button in the Leads table.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ---- Campaign card (scrollable row) ----

function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const typeLabel = CAMPAIGN_TYPES.find((t) => t.value === campaign.campaign_type)?.label ?? campaign.campaign_type;
  return (
    <button
      onClick={onClick}
      className="shrink-0 w-56 rounded-lg border border-border/60 bg-card p-4 text-left hover:border-primary/40 hover:bg-accent/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
        <span className="text-[10px] text-muted-foreground shrink-0">{campaign.season}</span>
      </div>
      <p className="text-xs font-medium truncate">{campaign.lead_product}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{campaign.hook}</p>
      <p className="text-[11px] text-muted-foreground mt-2">
        {campaign.recommended_lead_ids.length} recommended
      </p>
    </button>
  );
}

// ---- Campaign detail view ----

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
  const [showBrief, setShowBrief] = useState(false);

  const generateMutation = useGenerateClientDrafts();

  const typeLabel = CAMPAIGN_TYPES.find((t) => t.value === campaign.campaign_type)?.label ?? campaign.campaign_type;
  const recommendedSet = new Set(campaign.recommended_lead_ids);

  const targetIds = useMemo(() => {
    if (sendMode === "all") return clients.map((c) => c.id);
    if (sendMode === "recommended") return campaign.recommended_lead_ids;
    return customIds;
  }, [sendMode, clients, campaign.recommended_lead_ids, customIds]);

  function toggleCustom(id: string) {
    setCustomIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleGenerate() {
    if (targetIds.length === 0) {
      toast.error("No clients selected");
      return;
    }
    toast.promise(
      new Promise((resolve, reject) => {
        generateMutation.mutate(
          { lead_ids: targetIds, campaign_id: campaign.id },
          {
            onSuccess: (data) => resolve(data),
            onError: (err) => reject(err),
          }
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
        <button
          onClick={onBack}
          className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">{typeLabel}</h1>
            <Badge variant="secondary" className="text-[10px]">{campaign.season}</Badge>
            {campaign.extra_context && (
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                custom context
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {campaign.lead_product} — {campaign.hook}
          </p>
        </div>
      </div>

      {/* Brief (collapsible) */}
      <Card className="p-4">
        <button
          className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowBrief((v) => !v)}
        >
          Campaign brief
          {showBrief ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showBrief && (
          <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{campaign.brief}</p>
        )}
      </Card>

      {/* Send mode selector */}
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
                : "Custom selection"}
            </button>
          ))}
        </div>
      </div>

      {/* Client grid with badges */}
      {clients.length === 0 ? (
        <Card className="py-10 text-center text-muted-foreground">
          <Building2 className="mx-auto mb-3 h-7 w-7 opacity-30" />
          <p className="text-sm">No clients yet.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...clients]
            .sort((a, b) => {
              const aRec = recommendedSet.has(a.id) ? 0 : 1;
              const bRec = recommendedSet.has(b.id) ? 0 : 1;
              return aRec - bRec;
            })
            .map((client) => {
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

      {/* Generate footer */}
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
          {
            campaign_type: campaignType,
            extra_context: extraContext.trim() || undefined,
          },
          {
            onSuccess: (data) => resolve(data),
            onError: (err) => reject(err),
          }
        );
      }),
      {
        loading: "Creating campaign…",
        success: (campaign: Campaign) => {
          onCreated(campaign);
          return `Campaign created — ${campaign.recommended_lead_ids.length} client${campaign.recommended_lead_ids.length !== 1 ? "s" : ""} recommended`;
        },
        error: "Failed to create campaign",
      }
    );
  }

  const hint = CAMPAIGN_TYPES.find((t) => t.value === campaignType)?.hint;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-border/50 bg-card p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold">New Campaign</h2>

        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Campaign type
        </label>
        <select
          value={campaignType}
          onChange={(e) => setCampaignType(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {CAMPAIGN_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {hint && (
          <p className="mb-4 mt-1.5 text-xs text-muted-foreground">{hint}</p>
        )}

        {/* Suggest (optional free-text context) */}
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
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={createMutation.isPending}
            onClick={handleCreate}
          >
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
