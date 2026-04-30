"use client";

import React, { useState } from "react";
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
  AlarmClock,
  Building2,
  MessageSquareMore,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LeadDetailDialog } from "@/components/lead-detail-dialog";
import { updateLeadFields } from "@/lib/firestore-api";
import { useQueryClient } from "@tanstack/react-query";
import { useGenerateDrafts } from "@/hooks/use-outreach";
import { toast } from "sonner";
import type { Lead } from "@/lib/types";

interface Props {
  leads: Lead[];
  isLoading: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  openLeadId?: string | null;
  onLeadOpened?: () => void;
}

const REJECTION_LABELS: Record<string, string> = {
  snoozed:         "Snoozed",
  current_account: "Current Account",
  in_discussion:   "In Discussion",
  not_fit:         "Not a fit",
  no_response:     "No response",
  other:           "Other",
};

const LEAD_REJECT_REASONS = [
  { value: "snoozed",       label: "Snooze (next Mon)" },
  { value: "in_discussion", label: "In discussion" },
  { value: "not_fit",       label: "Not a fit" },
  { value: "no_response",   label: "No response" },
  { value: "other",         label: "Other" },
];

const rejectionColors: Record<string, string> = {
  snoozed: "border-amber-500/30 text-amber-400 bg-amber-500/10",
  current_account: "border-purple-500/30 text-purple-400 bg-purple-500/10",
  in_discussion: "border-sky-500/30 text-sky-400 bg-sky-500/10",
};

export function LeadsTable({ leads, isLoading, selectable, selectedIds = [], onSelectionChange, openLeadId, onLeadOpened }: Props) {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  React.useEffect(() => {
    if (openLeadId && leads.length > 0) {
      const lead = leads.find((l) => l.id === openLeadId);
      if (lead) { setSelectedLead(lead); onLeadOpened?.(); }
    }
  }, [openLeadId, leads]);
  const [pendingLeads, setPendingLeads] = useState<Set<string>>(new Set());
  const [rejectingLeadId, setRejectingLeadId] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ leadId: string; reason: string } | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState("");
  const qc = useQueryClient();
  const generateDrafts = useGenerateDrafts();

  const handleExport = () => {
    // Client-side CSV from current filtered view
    const escape = (v: string | null | undefined) => {
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const headers = ["Account Name", "Address", "Email Address", "Owner", "Stage", "Menu Fit", "Score", "Category", "Last Opened"];
    const rows = leads.map((l) => [
      l.business_name,
      l.address,
      l.contact_email || l.email,
      l.assigned_to_name,
      l.stage,
      l.menu_fit,
      l.score != null ? String(l.score) : "",
      l.venue_category || l.category,
      l.last_opened_at ? new Date(l.last_opened_at).toLocaleDateString("en-GB") : "",
    ].map(escape).join(","));
    const csv = [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asterley-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFullCrmExport = () => {
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

      if (lead.email) {
        toast.promise(
          new Promise((resolve, reject) => {
            generateDrafts.mutate([lead.id], {
              onSuccess: (data) => resolve(data),
              onError: (err) => reject(err),
            });
          }),
          {
            loading: "Generating draft…",
            success: "Draft generated",
            error: "Draft generation failed",
          }
        );
      } else {
        toast.success(`${lead.business_name} approved`);
        if (!lead.email) toast.warning("No email — draft skipped");
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

  async function handleReject(leadId: string, reason: string, notes?: string) {
    if (pendingLeads.has(leadId)) return;
    setPendingLeads((prev) => new Set(prev).add(leadId));
    try {
      const updates: Record<string, unknown> = {
        client_status: "rejected",
        rejection_reason: reason,
      };

      if (notes?.trim()) {
        updates.rejection_notes = notes.trim();
      }

      if (reason === "snoozed") {
        const now = new Date();
        const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
        const nextMonday = new Date(now);
        nextMonday.setDate(now.getDate() + daysUntilMonday);
        nextMonday.setHours(9, 0, 0, 0);
        updates.snoozed_until = nextMonday.toISOString();
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

  async function handleMarkAsClient(e: React.MouseEvent, leadId: string) {
    e.stopPropagation();
    if (pendingLeads.has(leadId)) return;
    setPendingLeads((prev) => new Set(prev).add(leadId));
    try {
      await updateLeadFields(leadId, {
        client_status: "current_account",
        stage: "client",
        rejection_reason: null,
      });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Marked as client");
    } catch (err) {
      console.error("Mark as client failed:", err);
      toast.error("Failed to mark as client");
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} title="Export current filtered view (no email copy)">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleFullCrmExport} title="Full CRM export — all leads with email copy sent">
              <Download className="mr-2 h-4 w-4" />
              Full CRM Export
            </Button>
          </div>
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
                {selectable && (
                  <TableHead className="w-10 px-2">
                    <input
                      type="checkbox"
                      className="rounded accent-primary"
                      checked={selectedIds.length === leads.length && leads.length > 0}
                      onChange={(e) => {
                        onSelectionChange?.(
                          e.target.checked ? leads.map((l) => l.id) : []
                        );
                      }}
                    />
                  </TableHead>
                )}
                <TableHead className="w-20"></TableHead>
                <TableHead className="w-[18%]">Business</TableHead>
                <TableHead className="w-[14%]">Category</TableHead>
                <TableHead className="w-[7%]">Fit</TableHead>
                <TableHead className="w-[22%]">Email</TableHead>
                <TableHead className="w-[14%]">Postcode</TableHead>
                <TableHead className="w-[6%] text-right">Score</TableHead>
                {selectable && <TableHead className="w-[10%]">Assigned</TableHead>}
                <TableHead className="w-[8%] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead, index) => (
                <React.Fragment key={lead.id}>
                <TableRow
                  className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                    lead.client_status === "rejected" && lead.rejection_reason !== "current_account" ? "opacity-60" : ""
                  } ${index % 2 === 1 ? "bg-muted/30" : ""}`}
                  onClick={() => setSelectedLead(lead)}
                >
                  {selectable && (
                    <TableCell className="w-10 px-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded accent-primary"
                        checked={selectedIds.includes(lead.id)}
                        onChange={(e) => {
                          onSelectionChange?.(
                            e.target.checked
                              ? [...selectedIds, lead.id]
                              : selectedIds.filter((id) => id !== lead.id)
                          );
                        }}
                      />
                    </TableCell>
                  )}
                  {/* Status column */}
                  <TableCell className="w-20 px-2">
                    <div className="flex flex-col gap-1">
                      {lead.client_status === "approved" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : lead.client_status === "rejected" && lead.rejection_reason === "snoozed" ? (
                        <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10">
                          <AlarmClock className="h-3 w-3" />
                          Snoozed
                        </Badge>
                      ) : lead.client_status === "current_account" || (lead.client_status === "rejected" && lead.rejection_reason === "current_account") ? (
                        <Badge variant="outline" className="gap-1 text-[10px] border-purple-500/30 text-purple-400 bg-purple-500/10">
                          <Building2 className="h-3 w-3" />
                          Client
                        </Badge>
                      ) : lead.client_status === "rejected" && lead.rejection_reason === "in_discussion" ? (
                        <Badge variant="outline" className="gap-1 text-[10px] border-sky-500/30 text-sky-400 bg-sky-500/10">
                          <MessageSquareMore className="h-3 w-3" />
                          In Disc.
                        </Badge>
                      ) : lead.client_status === "rejected" ? (
                        <Badge variant="outline" className="gap-1 text-[10px] border-red-500/30 text-red-400 bg-red-500/10">
                          <X className="h-3 w-3" />
                          Rejected
                        </Badge>
                      ) : null}
                      {lead.last_opened_at && (
                        <span
                          title={`Opened ${new Date(lead.last_opened_at).toLocaleDateString("en-GB")}${lead.open_count > 1 ? ` (${lead.open_count}×)` : ""}`}
                          className="flex items-center gap-0.5 text-[10px] text-sky-400"
                        >
                          <Eye className="h-3 w-3" />
                          {lead.open_count > 1 ? `${lead.open_count}×` : ""}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {/* Business name */}
                  <TableCell className="font-medium text-primary truncate">
                    <span className="truncate">{lead.business_name}</span>
                    {lead.source === "manual" && lead.enrichment_status !== "success" && (
                      <Badge variant="outline" className="ml-2 text-[9px] border-orange-500/30 text-orange-400 bg-orange-500/10">
                        Queued — next week
                      </Badge>
                    )}
                    {lead.source === "email_ingestion" && (
                      <Badge variant="outline" className="ml-2 text-[9px] border-sky-500/30 text-sky-400 bg-sky-500/10">
                        Via email
                      </Badge>
                    )}
                    {lead.client_status === "rejected" && lead.rejection_notes && (
                      <span className="ml-1 text-[10px] text-muted-foreground" title={lead.rejection_notes}>
                        — {lead.rejection_notes.length > 30 ? lead.rejection_notes.slice(0, 30) + "…" : lead.rejection_notes}
                      </span>
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
                  {selectable && (
                    <TableCell className="text-xs text-muted-foreground truncate">
                      {lead.assigned_to_name ?? "Unassigned"}
                    </TableCell>
                  )}
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
                          <button
                            className={`rounded p-1.5 transition-colors ${
                              lead.client_status === "current_account" || (lead.client_status === "rejected" && lead.rejection_reason === "current_account")
                                ? "bg-purple-500/20 text-purple-400"
                                : "text-muted-foreground hover:text-purple-400 hover:bg-purple-500/10"
                            }`}
                            onClick={(e) => handleMarkAsClient(e, lead.id)}
                            title="Mark as client"
                          >
                            <Building2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className={`rounded p-1.5 transition-colors ${
                              lead.client_status === "rejected" && lead.rejection_reason !== "current_account"
                                ? "bg-red-500/20 text-red-400"
                                : rejectingLeadId === lead.id
                                ? "bg-red-500/10 text-red-400"
                                : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                            }`}
                            title="Reject lead"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRejectingLeadId((id) => id === lead.id ? null : lead.id);
                            }}
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {rejectingLeadId === lead.id && (
                  <TableRow className="bg-red-500/5 hover:bg-red-500/5">
                    <TableCell colSpan={9} className="py-2 px-4">
                      <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-red-400 shrink-0">Reason:</span>
                        {LEAD_REJECT_REASONS.map(({ value, label }) => (
                          <button
                            key={value}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRejectingLeadId(null);
                              setRejectDialog({ leadId: lead.id, reason: value });
                              setRejectionNotes("");
                            }}
                            className="rounded-full border border-red-500/30 px-2.5 py-0.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          onClick={(e) => { e.stopPropagation(); setRejectingLeadId(null); }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                        >
                          Cancel
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </React.Fragment>
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

      {/* Rejection notes dialog */}
      {rejectDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setRejectDialog(null);
              setRejectionNotes("");
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-border/50 bg-card p-6 shadow-2xl">
            <h3 className="text-sm font-semibold mb-1">
              Reject as: {REJECTION_LABELS[rejectDialog.reason] ?? rejectDialog.reason}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Add optional notes explaining why.
            </p>
            <textarea
              className="w-full min-h-[80px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Notes (optional)..."
              value={rejectionNotes}
              onChange={(e) => setRejectionNotes(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRejectDialog(null);
                  setRejectionNotes("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  handleReject(rejectDialog.leadId, rejectDialog.reason, rejectionNotes);
                  setRejectDialog(null);
                  setRejectionNotes("");
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
