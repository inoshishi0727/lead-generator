"use client";

import { FileText, Send, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OutreachLead } from "@/hooks/use-outreach-plan";
import type { OutreachMessage } from "@/lib/types";

const FIT_COLORS: Record<string, string> = {
  strong: "text-emerald-400",
  moderate: "text-amber-400",
  weak: "text-zinc-500",
  unknown: "text-zinc-600",
};

interface Props {
  lead: OutreachLead;
  rank: number;
  action: "generate" | "send" | "contacted";
  messageId?: string;
  onAction: (lead: OutreachLead, action: "generate" | "send", messageId?: string) => void;
  onLeadClick?: (lead: OutreachLead) => void;
  isPending?: boolean;
}

export function ActionableLeadCard({ lead, rank, action, messageId, onAction, onLeadClick, isPending }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/10 p-3 transition-colors hover:bg-muted/20">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
        {rank}
      </span>
      <div className="flex-1 min-w-0 space-y-1 cursor-pointer" onClick={() => onLeadClick?.(lead)}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{lead.business_name}</span>
          <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
            {lead.venue_category.replace(/_/g, " ")}
          </Badge>
          {lead.menu_fit && (
            <span className={`text-[10px] font-medium ${FIT_COLORS[lead.menu_fit]}`}>
              {lead.menu_fit}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {lead.lead_products.map((p) => (
            <Badge key={p} variant="outline" className="text-[9px] font-mono h-4">
              {p}
            </Badge>
          ))}
        </div>
        {lead.reasons.length > 0 && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {lead.reasons[0]}
          </p>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        {lead.contact_name && (
          <p className="text-[10px] text-muted-foreground">{lead.contact_name}</p>
        )}
        {lead.email ? (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            {lead.email.length > 25 ? lead.email.slice(0, 25) + "..." : lead.email}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-500">No email</span>
        )}
        {action === "contacted" ? (
          <span className="text-[10px] text-muted-foreground px-2 py-1">Contacted</span>
        ) : action ? (
          <Button
            size="sm"
            variant={action === "generate" ? "default" : "outline"}
            className={`h-7 text-[11px] px-2 shrink-0 ${
              action === "generate"
                ? "bg-primary hover:bg-primary/90"
                : "border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
            }`}
            disabled={isPending}
            onClick={(e) => { e.stopPropagation(); onAction(lead, action, messageId); }}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : action === "generate" ? (
              <>
                <FileText className="h-3 w-3 mr-1" />
                Generate Draft
              </>
            ) : (
              <>
                <Send className="h-3 w-3 mr-1" />
                Send Email
              </>
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
