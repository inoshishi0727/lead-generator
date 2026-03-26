"use client";

import { useEffect } from "react";
import {
  X,
  MapPin,
  Mail,
  Phone,
  Globe,
  Star,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Lead } from "@/lib/types";

interface Props {
  lead: Lead | null;
  onClose: () => void;
}

const FIT_COLORS: Record<string, string> = {
  strong: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  moderate: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  weak: "bg-red-500/15 text-red-400 border-red-500/20",
  unknown: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground pt-0.5">
        {label}
      </span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}

export function LeadDetailDialog({ lead, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!lead) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh] backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-xl rounded-lg border border-border/50 bg-card shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="p-5 pb-4">
          <h2 className="pr-8 text-lg font-semibold">{lead.business_name}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lead.venue_category && (
              <Badge variant="secondary" className="text-[11px] capitalize">
                {lead.venue_category.replace(/_/g, " ")}
              </Badge>
            )}
            {lead.score != null && (
              <Badge variant="outline" className="text-[11px] tabular-nums">
                Score {lead.score}
              </Badge>
            )}
            {lead.menu_fit && (
              <Badge variant="outline" className={`text-[11px] ${FIT_COLORS[lead.menu_fit] ?? ""}`}>
                {lead.menu_fit} fit
              </Badge>
            )}
            {lead.price_tier && (
              <Badge variant="outline" className="text-[11px] capitalize">
                {lead.price_tier.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          {/* AI Approval Recommendation */}
          <div className={`mt-3 rounded-lg p-3 ${
            lead.ai_approval === "approve" ? "bg-emerald-500/10 border border-emerald-500/20" :
            lead.ai_approval === "reject" ? "bg-red-500/10 border border-red-500/20" :
            lead.ai_approval === "maybe" ? "bg-amber-500/10 border border-amber-500/20" :
            "bg-muted/30 border border-border/50"
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className={`h-3.5 w-3.5 ${
                lead.ai_approval === "approve" ? "text-emerald-400" :
                lead.ai_approval === "reject" ? "text-red-400" :
                lead.ai_approval === "maybe" ? "text-amber-400" :
                "text-muted-foreground"
              }`} />
              <span className={`text-xs font-bold uppercase ${
                lead.ai_approval === "approve" ? "text-emerald-400" :
                lead.ai_approval === "reject" ? "text-red-400" :
                lead.ai_approval === "maybe" ? "text-amber-400" :
                "text-muted-foreground"
              }`}>
                {lead.ai_approval ? `AI recommends: ${lead.ai_approval}` : "AI: Pending enrichment"}
              </span>
            </div>
            <p className="text-[12px] leading-relaxed">
              {lead.ai_approval_reason || (
                lead.why_asterley_fits
                  ? lead.why_asterley_fits
                  : lead.enrichment_status === "success"
                    ? "No specific recommendation available"
                    : "Run enrichment to get AI approval recommendation"
              )}
            </p>
          </div>
        </div>

        <div className="border-t" />

        {/* AI Analysis */}
        <div className="p-5 space-y-3">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" /> AI Analysis
          </h3>
          {lead.enrichment_status === "success" ? (
            <div className="space-y-2">
              <Row label="Summary">{lead.business_summary || "No data available"}</Row>
              <Row label="Drinks">
                {lead.drinks_programme ? (
                  <ul className="list-disc list-inside space-y-0.5 text-sm">
                    {lead.drinks_programme.split(/[.;]/).filter(s => s.trim()).map((item, i) => (
                      <li key={i} className="text-foreground">{item.trim()}</li>
                    ))}
                  </ul>
                ) : "No data available"}
              </Row>
              <Row label="Why we fit">{lead.why_asterley_fits || "No data available"}</Row>
              {lead.menu_fit_signals?.length > 0 && (
                <Row label="Signals">
                  <span className="text-xs text-muted-foreground">
                    {lead.menu_fit_signals.join(" / ")}
                  </span>
                </Row>
              )}
              <Row label="Hours">{lead.opening_hours_summary || "No data available"}</Row>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data available</p>
          )}
          {lead.lead_products.length > 0 && (
            <div className="flex gap-1 pt-1">
              {lead.lead_products.map((p) => (
                <Badge key={p} variant="outline" className="text-[10px] font-mono">
                  {p}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="border-t" />

        {/* Contact + Location */}
        <div className="p-5 space-y-2">
          <Row label="Email">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="text-primary hover:underline flex items-center gap-1">
                <Mail className="h-3 w-3" /> {lead.email}
              </a>
            )}
          </Row>
          <Row label="Phone">
            {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.phone}</span>}
          </Row>
          <Row label="Contact">{lead.contact_name}{lead.contact_role && ` (${lead.contact_role})`}</Row>
          <Row label="Address">
            {lead.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {lead.address}</span>}
          </Row>
          <Row label="Area">{lead.location_area}</Row>
          <Row label="Website">
            {lead.website && (
              <a href={lead.website} target="_blank" rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {lead.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 35)}
              </a>
            )}
          </Row>
          <Row label="Rating">
            {lead.rating != null && (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 text-amber-400" />
                {lead.rating.toFixed(1)}
                <span className="text-muted-foreground">({lead.review_count ?? 0})</span>
              </span>
            )}
          </Row>
        </div>
      </div>
    </div>
  );
}
