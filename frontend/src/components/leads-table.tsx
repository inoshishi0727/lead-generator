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
import { Download, Check, X, AlertTriangle, ThumbsUp, ThumbsDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LeadDetailDialog } from "@/components/lead-detail-dialog";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@/lib/types";

interface Props {
  leads: Lead[];
  isLoading: boolean;
}

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
        <Card className="shadow-md">
          <div className="max-h-[70vh] overflow-auto">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-[22%]">Business</TableHead>
                <TableHead className="w-[14%]">Category</TableHead>
                <TableHead className="w-[7%]">Fit</TableHead>
                <TableHead className="w-[22%]">Email</TableHead>
                <TableHead className="w-[14%]">Postcode</TableHead>
                <TableHead className="w-[6%] text-right">Score</TableHead>
                <TableHead className="w-[8%] text-center">Actions</TableHead>
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
                    {lead.client_status === "approved" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : lead.client_status === "rejected" ? (
                      <X className="h-3.5 w-3.5 text-red-400" />
                    ) : null}
                  </TableCell>
                  {/* Business name */}
                  <TableCell className="font-medium text-primary truncate">
                    <span className="truncate">{lead.business_name}</span>
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
                  <TableCell className="truncate">
                    {lead.email ? (
                      <span className="text-xs text-primary">
                        {lead.email}
                      </span>
                    ) : (
                      <span className="text-xs text-red-400">No email</span>
                    )}
                  </TableCell>
                  {/* Postcode */}
                  <TableCell className="text-xs text-muted-foreground truncate">
                    {lead.location_postcode ?? "\u2014"}
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
          </div>
        </Card>
      )}

      <LeadDetailDialog
        lead={selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}
