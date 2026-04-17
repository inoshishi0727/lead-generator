"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClients } from "@/lib/firestore-api";
import { useGenerateClientDrafts } from "@/hooks/use-outreach";
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
} from "lucide-react";
import { toast } from "sonner";
import type { Lead } from "@/lib/types";

const CAMPAIGN_TYPES = [
  { value: "seasonal", label: "Seasonal Promo" },
  { value: "reorder", label: "Reorder Nudge" },
  { value: "new_product", label: "New Product" },
  { value: "new_menu", label: "New Menu Support" },
  { value: "event", label: "Event / Collaboration" },
];

export default function ClientsPage() {
  const [showCampaign, setShowCampaign] = useState(false);
  const [campaignType, setCampaignType] = useState("seasonal");
  const [campaignBrief, setCampaignBrief] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: getClients,
  });

  const generateMutation = useGenerateClientDrafts();

  function toggleClient(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.length === clients.length ? [] : clients.map((c) => c.id)
    );
  }

  async function handleGenerate() {
    if (selectedIds.length === 0) {
      toast.error("Select at least one client");
      return;
    }
    if (!campaignBrief.trim()) {
      toast.error("Add a campaign brief");
      return;
    }
    toast.promise(
      new Promise((resolve, reject) => {
        generateMutation.mutate(
          {
            lead_ids: selectedIds,
            campaign_type: campaignType,
            campaign_brief: campaignBrief.trim(),
          },
          {
            onSuccess: (data) => resolve(data),
            onError: (err) => reject(err),
          }
        );
      }),
      {
        loading: "Generating client campaign drafts…",
        success: (data: any) =>
          `${data.generated} draft${data.generated !== 1 ? "s" : ""} generated — review them in Outreach → Clients`,
        error: "Draft generation failed",
      }
    );
    setShowCampaign(false);
    setCampaignBrief("");
    setSelectedIds([]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${clients.length} active client${clients.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button onClick={() => setShowCampaign(true)} size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Campaign
        </Button>
      </div>

      {isLoading ? (
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

      {/* Campaign creation modal */}
      {showCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCampaign(false);
          }}
        >
          <div className="w-full max-w-lg rounded-lg border border-border/50 bg-card p-6 shadow-2xl">
            <h2 className="mb-4 text-base font-semibold">New Client Campaign</h2>

            {/* Campaign type */}
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Campaign type
            </label>
            <select
              value={campaignType}
              onChange={(e) => setCampaignType(e.target.value)}
              className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            {/* Brief */}
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Campaign brief
            </label>
            <textarea
              className="mb-4 w-full min-h-[80px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Summer elderflower aperitivo launch — highlight the seasonal angle and suggest pairing with their garden menu…"
              value={campaignBrief}
              onChange={(e) => setCampaignBrief(e.target.value)}
              autoFocus
            />

            {/* Client selector */}
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Select clients ({selectedIds.length} / {clients.length})
                </label>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={toggleAll}
                >
                  {selectedIds.length === clients.length ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-input bg-background p-2">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    onClick={() => toggleClient(client.id)}
                  >
                    {selectedIds.includes(client.id) ? (
                      <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate font-medium">{client.business_name}</span>
                    {client.stage === "converted" && (
                      <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">
                        converted
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCampaign(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={generateMutation.isPending || selectedIds.length === 0 || !campaignBrief.trim()}
                onClick={handleGenerate}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Generate Drafts
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientCard({ client }: { client: Lead }) {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate text-sm">{client.business_name}</p>
          {client.location_area && (
            <p className="text-xs text-muted-foreground truncate">{client.location_area}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
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
