"use client";

import { useEffect, useState } from "react";
import {
  X,
  MapPin,
  Mail,
  Phone,
  Globe,
  Star,
  Sparkles,
  RefreshCw,
  Eye,
  Pencil,
  Check,
  Instagram,
  Twitter,
  Facebook,
  Youtube,
  Users,
  ExternalLink,
  Briefcase,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEnrichLeads } from "@/hooks/use-leads";
import { useLinkedInEmployees } from "@/hooks/use-linkedin-employees";
import { updateLeadFields } from "@/lib/firestore-api";
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

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-red-400",
};

function LinkedInEmployeesSection({ leadId }: { leadId: string }) {
  const { data: employees, isLoading } = useLinkedInEmployees(leadId);

  if (isLoading) {
    return (
      <div className="p-5 space-y-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3 w-3" /> Employees
        </h3>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!employees || employees.length === 0) return null;

  const decisionMakers = employees.filter((e) => e.is_decision_maker);
  const others = employees.filter((e) => !e.is_decision_maker);

  return (
    <div className="p-5 space-y-3">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="h-3 w-3" /> Employees
        <span className="text-muted-foreground/60 font-normal">({employees.length})</span>
      </h3>
      <div className="space-y-1.5">
        {decisionMakers.length > 0 && (
          <div className="space-y-1.5">
            {decisionMakers.map((emp) => (
              <EmployeeRow key={emp.id} emp={emp} />
            ))}
          </div>
        )}
        {others.length > 0 && (
          <details className={decisionMakers.length > 0 ? "mt-2" : ""}>
            <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              {decisionMakers.length > 0
                ? `${others.length} other${others.length > 1 ? "s" : ""}`
                : `Show ${others.length} employee${others.length > 1 ? "s" : ""}`}
            </summary>
            <div className="mt-1.5 space-y-1.5">
              {others.map((emp) => (
                <EmployeeRow key={emp.id} emp={emp} />
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function EmployeeRow({ emp }: { emp: import("@/lib/types").LinkedInEmployee }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border/30 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <a
            href={emp.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline truncate flex items-center gap-1"
          >
            {emp.name}
            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
          </a>
          {emp.is_decision_maker && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0">
              <Briefcase className="h-2.5 w-2.5 mr-0.5" />
              DM
            </Badge>
          )}
        </div>
        {emp.title && (
          <p className="text-[11px] text-muted-foreground truncate">{emp.title}</p>
        )}
      </div>
      <span className={`text-[10px] font-medium uppercase ${CONFIDENCE_COLORS[emp.confidence] ?? ""}`}>
        {emp.confidence}
      </span>
    </div>
  );
}

export function LeadDetailDialog({ lead, onClose }: Props) {
  const enrichMutation = useEnrichLeads();
  const [enrichDone, setEnrichDone] = useState(false);
  const [editingMenuUrl, setEditingMenuUrl] = useState(false);
  const [menuUrlDraft, setMenuUrlDraft] = useState("");
  const [savingMenuUrl, setSavingMenuUrl] = useState(false);

  async function handleSaveMenuUrl() {
    if (!lead) return;
    setSavingMenuUrl(true);
    try {
      await updateLeadFields(lead.id, { menu_url: menuUrlDraft.trim() || null });
      setEditingMenuUrl(false);
    } finally {
      setSavingMenuUrl(false);
    }
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleReEnrich() {
    if (!lead) return;
    setEnrichDone(false);
    enrichMutation.mutate(
      { lead_ids: [lead.id] },
      { onSuccess: () => setEnrichDone(true) },
    );
  }

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
          <div className="flex items-start gap-3 text-sm">
            <span className="w-28 shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground pt-0.5">
              Menu
            </span>
            <span className="flex-1">
              {editingMenuUrl ? (
                <span className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    type="url"
                    value={menuUrlDraft}
                    onChange={(e) => setMenuUrlDraft(e.target.value)}
                    placeholder="https://example.com/menu"
                    className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-0.5 text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveMenuUrl(); if (e.key === "Escape") setEditingMenuUrl(false); }}
                  />
                  <button
                    onClick={handleSaveMenuUrl}
                    disabled={savingMenuUrl}
                    className="text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setEditingMenuUrl(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : lead.menu_url && lead.menu_url !== "not_found" ? (
                <span className="flex items-center gap-1.5">
                  <a href={lead.menu_url} target="_blank" rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {lead.menu_url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}
                  </a>
                  <button
                    onClick={() => { setMenuUrlDraft(lead.menu_url ?? ""); setEditingMenuUrl(true); }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-sm">
                    {lead.menu_url === "not_found" ? "Link not found" : "Not set"}
                  </span>
                  <button
                    onClick={() => { setMenuUrlDraft(""); setEditingMenuUrl(true); }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </span>
              )}
            </span>
          </div>
          {lead.last_opened_at && (
            <Row label="Email opened">
              <span className="flex items-center gap-1.5 text-sky-400">
                <Eye className="h-3 w-3" />
                {new Date(lead.last_opened_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {lead.open_count > 1 && (
                  <span className="text-muted-foreground text-[11px]">({lead.open_count} times)</span>
                )}
              </span>
            </Row>
          )}
        </div>

        <div className="border-t" />

        {/* Social Media + LinkedIn Company */}
        {(lead.instagram_handle || lead.twitter_handle || lead.facebook_url || lead.tiktok_handle || lead.youtube_url || lead.linkedin_company_size || lead.linkedin_industry) && (
          <>
            <div className="p-5 space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Globe className="h-3 w-3" /> Social & Company
              </h3>
              <div className="flex flex-wrap gap-2">
                {lead.instagram_handle && (
                  <a
                    href={`https://instagram.com/${lead.instagram_handle.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1 text-xs hover:bg-muted/50 transition-colors"
                  >
                    <Instagram className="h-3 w-3 text-pink-400" />
                    {lead.instagram_handle}
                  </a>
                )}
                {lead.twitter_handle && (
                  <a
                    href={`https://x.com/${lead.twitter_handle.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1 text-xs hover:bg-muted/50 transition-colors"
                  >
                    <Twitter className="h-3 w-3 text-sky-400" />
                    {lead.twitter_handle}
                  </a>
                )}
                {lead.facebook_url && (
                  <a
                    href={lead.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1 text-xs hover:bg-muted/50 transition-colors"
                  >
                    <Facebook className="h-3 w-3 text-blue-400" />
                    Facebook
                  </a>
                )}
                {lead.tiktok_handle && (
                  <a
                    href={`https://tiktok.com/@${lead.tiktok_handle.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1 text-xs hover:bg-muted/50 transition-colors"
                  >
                    <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.73a8.19 8.19 0 004.76 1.52V6.8a4.84 4.84 0 01-1-.11z"/></svg>
                    {lead.tiktok_handle}
                  </a>
                )}
                {lead.youtube_url && (
                  <a
                    href={lead.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1 text-xs hover:bg-muted/50 transition-colors"
                  >
                    <Youtube className="h-3 w-3 text-red-500" />
                    YouTube
                  </a>
                )}
              </div>
              {lead.linkedin_company_size && (
                <Row label="Company size">{lead.linkedin_company_size}</Row>
              )}
              {lead.linkedin_industry && (
                <Row label="Industry">{lead.linkedin_industry}</Row>
              )}
              {lead.social_media_scraped_at && (
                <p className="text-[10px] text-muted-foreground pt-1">
                  Scraped {new Date(lead.social_media_scraped_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </p>
              )}
            </div>
            <div className="border-t" />
          </>
        )}

        {/* LinkedIn Employees */}
        <LinkedInEmployeesSection leadId={lead.id} />

        <div className="border-t" />

        {/* Provenance */}
        <div className="px-5 pb-4 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Added via</p>
          <p className="text-xs text-muted-foreground">
            {lead.source === "email_ingestion"
              ? <>Email ingestion{lead.added_by_name ? <> by <span className="text-foreground">{lead.added_by_name}</span></> : lead.added_by_email ? <> by <span className="text-foreground">{lead.added_by_email}</span></> : ""}</>
              : lead.source === "manual"
              ? "Added manually"
              : lead.source === "google_maps"
              ? "Google Maps scrape"
              : lead.source ?? "Unknown"}
            {(lead.scraped_at || lead.created_at) && (
              <> · {new Date(lead.scraped_at ?? lead.created_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
            )}
          </p>
        </div>

        <div className="border-t" />

        {/* Re-enrich footer */}
        <div className="flex items-center justify-between p-4">
          <p className="text-xs text-muted-foreground">
            Re-enriching captures a fresh menu URL and updates the drinks programme.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReEnrich}
            disabled={enrichMutation.isPending}
            className="shrink-0 ml-3"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${enrichMutation.isPending ? "animate-spin" : ""}`} />
            {enrichMutation.isPending ? "Enriching..." : enrichDone ? "Done!" : "Re-enrich"}
          </Button>
        </div>
      </div>
    </div>
  );
}
