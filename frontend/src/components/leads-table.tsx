"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ExternalLink, Mail, Check, X, AlertTriangle, ThumbsUp, ThumbsDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LeadDetailDialog } from "@/components/lead-detail-dialog";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@/lib/types";

interface Props {
  leads: Lead[];
  isLoading: boolean;
}

function domainOnly(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const STAGE_COLORS: Record<string, string> = {
  scraped: "bg-blue-500/20 text-blue-400",
  needs_email: "bg-yellow-500/20 text-yellow-400",
  scored: "bg-green-500/20 text-green-400",
  draft_generated: "bg-purple-500/20 text-purple-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  sent: "bg-cyan-500/20 text-cyan-400",
};

const SOURCE_LABELS: Record<string, string> = {
  google_maps: "Google Maps",
  instagram: "Instagram",
};

function needsRescrape(lead: Lead): boolean {
  if (!lead.drinks_programme || lead.drinks_programme === "null") return true;
  if (lead.enrichment_status !== "success") return true;
  return false;
}

export function LeadsTable({ leads, isLoading }: Props) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const qc = useQueryClient();

  const handleExport = () => {
    window.open("/api/leads/export", "_blank");
  };

  async function handleApprove(e: React.MouseEvent, leadId: string) {
    e.stopPropagation();
    await api.patch(`/api/leads/${leadId}`, { client_status: "approved" });
    qc.invalidateQueries({ queryKey: ["leads"] });
  }

  async function handleReject(e: React.MouseEvent, leadId: string) {
    e.stopPropagation();
    await api.patch(`/api/leads/${leadId}`, { client_status: "rejected" });
    qc.invalidateQueries({ queryKey: ["leads"] });
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {leads.length} lead{leads.length !== 1 ? "s" : ""}
        </p>
        {leads.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      {leads.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No leads yet. Run a scrape from the Dashboard.
        </p>
      ) : (
        <Card className="overflow-hidden shadow-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Fit</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Area</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead, index) => (
                <TableRow
                  key={lead.id}
                  className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                    lead.client_status === "rejected" ? "opacity-40" : ""
                  } ${index % 2 === 1 ? "bg-muted/30" : ""}`}
                  onClick={() => setSelectedLead(lead)}
                >
                  {/* Flag column */}
                  <TableCell className="w-8 px-2">
                    {needsRescrape(lead) ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                    ) : lead.client_status === "approved" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : lead.client_status === "rejected" ? (
                      <X className="h-3.5 w-3.5 text-red-400" />
                    ) : null}
                  </TableCell>
                  {/* Business name */}
                  <TableCell className="font-medium text-primary">
                    <div className="flex items-center gap-1.5">
                      {lead.business_name}
                      {needsRescrape(lead) && (
                        <Badge variant="destructive" className="text-[8px] h-4 px-1">
                          re-scrape
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {/* Category */}
                  <TableCell>
                    {lead.venue_category ? (
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {lead.venue_category.replace(/_/g, " ")}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{lead.category ?? "\u2014"}</span>
                    )}
                  </TableCell>
                  {/* Menu fit */}
                  <TableCell>
                    {lead.menu_fit ? (
                      <span className={`text-xs font-medium ${
                        lead.menu_fit === "strong" ? "text-emerald-400" :
                        lead.menu_fit === "moderate" ? "text-amber-400" :
                        "text-zinc-500"
                      }`}>
                        {lead.menu_fit}
                      </span>
                    ) : "\u2014"}
                  </TableCell>
                  {/* Email */}
                  <TableCell>
                    {lead.email ? (
                      <span className="text-xs text-primary truncate max-w-[180px] block">
                        {lead.email}
                      </span>
                    ) : (
                      <span className="text-xs text-red-400">No email</span>
                    )}
                  </TableCell>
                  {/* Area */}
                  <TableCell className="text-xs text-muted-foreground">
                    {lead.location_area ?? "\u2014"}
                  </TableCell>
                  {/* Score */}
                  <TableCell className="text-right font-mono text-xs">
                    {lead.score ?? "\u2014"}
                  </TableCell>
                  {/* Actions */}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`rounded p-1 transition-colors ${
                          lead.client_status === "approved"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
                        }`}
                        onClick={(e) => handleApprove(e, lead.id)}
                        title="Approve lead"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className={`rounded p-1 transition-colors ${
                          lead.client_status === "rejected"
                            ? "bg-red-500/20 text-red-400"
                            : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                        }`}
                        onClick={(e) => handleReject(e, lead.id)}
                        title="Reject lead"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <LeadDetailDialog
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}
