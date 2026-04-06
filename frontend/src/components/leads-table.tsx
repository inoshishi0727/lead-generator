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
import {
  Download,
  Check,
  X,
  ChevronDown,
  AlarmClock,
  Building2,
  MessageSquareMore,
  ThumbsUp,
  ThumbsDown,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "@/components/ui/menu";
import { LeadDetailDialog } from "@/components/lead-detail-dialog";
import { updateLeadFields } from "@/lib/firestore-api";
import { useQueryClient } from "@tanstack/react-query";
import { useGenerateDrafts } from "@/hooks/use-outreach";
import { toast } from "sonner";
import type { Lead } from "@/lib/types";

interface Props {
  leads: Lead[];
  isLoading: boolean;
}

const REJECTION_LABELS: Record<string, string> = {
  snoozed: "Snoozed",
  current_account: "Current Account",
  in_discussion: "In Discussion",
};

const rejectionColors: Record<string, string> = {
  snoozed: "border-amber-500/30 text-amber-400 bg-amber-500/10",
  current_account: "border-purple-500/30 text-purple-400 bg-purple-500/10",
  in_discussion: "border-sky-500/30 text-sky-400 bg-sky-500/10",
};

export function LeadsTable({ leads, isLoading }: Props) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [pendingLeads, setPendingLeads] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const generateDrafts = useGenerateDrafts();

  const handleExport = () => {
    window.open("/api/leads/export", "_blank");
  };

  async function handleApprove(e: React.MouseEvent, lead: Lead) {
    e.stopPropagation();
    if (pendingLeads.has(lead.id)) return;
    setPendingLeads((prev) => new Set(prev).add(lead.id));
    try {
      await updateLeadFields(lead.id, {
        client_status: "approved",
        rejection_reason: null,
      });
      qc.invalidateQueries({ queryKey: ["leads"] });

      if (lead.email && lead.enrichment_status === "success") {
        toast.promise(
          new Promise((resolve, reject) => {
            generateDrafts.mutate([lead.id], {
              onSuccess: (data) => resolve(data),
              onError: (err) => reject(err),
            });
          }),
          {
            loading: `Generating draft for ${lead.business_name}...`,
            success: "Draft generated",
            error: "Draft generation failed",
          }
        );
      } else {
        toast.success(`${lead.business_name} approved`);
        if (!lead.email) toast.warning("No email — draft skipped");
        else if (lead.enrichment_status !== "success") toast.warning("Not enriched — draft skipped");
      }
    } catch (err) {
      console.error("Approve failed:", err);
      toast.error("Failed to approve lead");
    } finally {
      setPendingLeads((prev) => {
        const next = new Set(prev);
        next.delete(lead.id);
        return next;
      });
    }
  }

  async function handleReject(e: React.MouseEvent, leadId: string, reason: string) {
    e.stopPropagation();
    if (pendingLeads.has(leadId)) return;
    setPendingLeads((prev) => new Set(prev).add(leadId));
    try {
      const updates: Record<string, unknown> = {
        client_status: "rejected",
        rejection_reason: reason,
      };

      if (reason === "snoozed") {
        const now = new Date();
        const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
        const nextMonday = new Date(now);
        nextMonday.setDate(now.getDate() + daysUntilMonday);
        nextMonday.setHours(9, 0, 0, 0);
        updates.snoozed_until = nextMonday.toISOString();
      } else if (reason === "current_account") {
        updates.stage = "declined";
      } else if (reason === "in_discussion") {
        const snoozeUntil = new Date();
        snoozeUntil.setDate(snoozeUntil.getDate() + 60);
        updates.snoozed_until = snoozeUntil.toISOString();
      }

      await updateLeadFields(leadId, updates);
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead rejected");
    } catch (err) {
      console.error("Reject failed:", err);
      toast.error("Failed to reject lead");
    } finally {
      setPendingLeads((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    }
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
                    lead.client_status === "rejected" ? "opacity-60" : ""
                  } ${index % 2 === 1 ? "bg-muted/30" : ""}`}
                  onClick={() => setSelectedLead(lead)}
                >
                  {/* Flag column */}
                  <TableCell className="w-8 px-2">
                    {lead.client_status === "approved" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : lead.client_status === "rejected" && lead.rejection_reason === "snoozed" ? (
                      <AlarmClock className="h-3.5 w-3.5 text-amber-400" />
                    ) : lead.client_status === "rejected" && lead.rejection_reason === "current_account" ? (
                      <Building2 className="h-3.5 w-3.5 text-purple-400" />
                    ) : lead.client_status === "rejected" && lead.rejection_reason === "in_discussion" ? (
                      <MessageSquareMore className="h-3.5 w-3.5 text-sky-400" />
                    ) : lead.client_status === "rejected" ? (
                      <X className="h-3.5 w-3.5 text-red-400" />
                    ) : null}
                  </TableCell>
                  {/* Business name */}
                  <TableCell className="font-medium text-primary truncate">
                    <span className="truncate">{lead.business_name}</span>
                    {lead.source === "manual" && lead.enrichment_status !== "success" && (
                      <Badge variant="outline" className="ml-2 text-[9px] border-orange-500/30 text-orange-400 bg-orange-500/10">
                        Queued — next week
                      </Badge>
                    )}
                    {lead.client_status === "rejected" && lead.rejection_reason && (
                      <Badge
                        variant="outline"
                        className={`ml-2 text-[9px] ${rejectionColors[lead.rejection_reason] || ""}`}
                      >
                        {REJECTION_LABELS[lead.rejection_reason] || lead.rejection_reason}
                      </Badge>
                    )}
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
                      {pendingLeads.has(lead.id) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <button
                            className={`rounded p-1.5 transition-colors ${
                              lead.client_status === "approved"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"
                            }`}
                            onClick={(e) => handleApprove(e, lead)}
                            title="Approve lead"
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <Menu>
                            <MenuTrigger
                              render={
                                <button
                                  className={`rounded p-1.5 transition-colors ${
                                    lead.client_status === "rejected"
                                      ? "bg-red-500/20 text-red-400"
                                      : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                  }`}
                                  title="Reject lead"
                                >
                                  <ThumbsDown className="h-3.5 w-3.5" />
                                </button>
                              }
                            />
                            <MenuContent side="bottom" align="end" sideOffset={4}>
                              <MenuItem onClick={(e) => handleReject(e, lead.id, "snoozed")}>
                                <AlarmClock className="h-3.5 w-3.5" />
                                Snooze until next week
                              </MenuItem>
                              <MenuItem onClick={(e) => handleReject(e, lead.id, "current_account")}>
                                <Building2 className="h-3.5 w-3.5" />
                                Current account
                              </MenuItem>
                              <MenuItem onClick={(e) => handleReject(e, lead.id, "in_discussion")}>
                                <MessageSquareMore className="h-3.5 w-3.5" />
                                In discussion (60 days)
                              </MenuItem>
                            </MenuContent>
                          </Menu>
                        </>
                      )}
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
