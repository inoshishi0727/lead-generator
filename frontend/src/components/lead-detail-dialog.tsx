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
  Loader2,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagInput } from "@/components/tag-input";
import { AutoTagChips } from "@/components/auto-tag-chips";
import { LeadConversation, LeadConversationHeader } from "@/components/lead-conversation";
import { useEnrichLeads } from "@/hooks/use-leads";
import { useScrapeLeadNow } from "@/hooks/use-scrape-leads";
import { useLinkedInEmployees } from "@/hooks/use-linkedin-employees";
import { useTagIndex } from "@/hooks/use-tag-index";
import { updateLeadFields, type LeadsPage } from "@/lib/firestore-api";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Lead } from "@/lib/types";

// Optimistically patch a lead's fields across every cached query that holds it
// (`["lead", id]` for the detail dialog, every `["leads", "infinite", ...]`
// page for the leads table). Avoids a full network re-fetch on every inline
// edit — the previous `invalidateQueries({ queryKey: ["leads"] })` matched the
// infinite list, the top-hot list, and any cached single-page useLeads, which
// is what was making each save feel slow once the background prefetch had
// pulled in the rest of the dataset.
function applyLeadPatchToCache(qc: QueryClient, leadId: string, patch: Partial<Lead>) {
  qc.setQueryData<Lead | undefined>(["lead", leadId], (old) =>
    old ? { ...old, ...patch } : old,
  );
  qc.setQueriesData<{ pages: LeadsPage[]; pageParams: unknown[] } | undefined>(
    { queryKey: ["leads", "infinite"] },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          leads: page.leads.map((l) => (l.id === leadId ? { ...l, ...patch } : l)),
        })),
      };
    },
  );
}

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onEmail?: (lead: Lead) => void;
}

const FIT_COLORS: Record<string, string> = {
  strong: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  moderate: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  weak: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  unknown: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VENUE_CATEGORIES = [
  "cocktail_bar",
  "wine_bar",
  "italian_restaurant",
  "gastropub",
  "hotel_bar",
  "bottle_shop",
  "deli_farm_shop",
  "events_catering",
  "rtd",
  "restaurant_groups",
  "festival_operators",
  "cookery_schools",
  "corporate_gifting",
  "membership_clubs",
  "airlines_trains",
  "subscription_boxes",
  "film_tv_theatre",
  "yacht_charter",
  "luxury_food_retail",
  "grocery",
] as const;

function formatCategoryLabel(slug: string): string {
  return slug
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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

export function LeadDetailDialog({ lead: leadProp, onClose, onEmail }: Props) {
  const enrichMutation = useEnrichLeads();
  const scrapeLead = useScrapeLeadNow();
  const [enrichDone, setEnrichDone] = useState(false);
  const queryClient = useQueryClient();

  // The parent passes a snapshot of the lead via props; its own state isn't
  // updated when we patch the query cache, so the dialog would otherwise keep
  // showing the pre-save value until the user closed and reopened. Layering
  // local overrides on top of the prop gives the dialog a live view without
  // forcing the parent to thread a setter through every render.
  const [overrides, setOverrides] = useState<Partial<Lead>>({});
  useEffect(() => {
    setOverrides({});
  }, [leadProp?.id]);
  const lead = leadProp ? ({ ...leadProp, ...overrides } as Lead) : null;
  const [editingMenuUrl, setEditingMenuUrl] = useState(false);
  const [menuUrlDraft, setMenuUrlDraft] = useState("");
  const [savingMenuUrl, setSavingMenuUrl] = useState(false);
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteDraft, setWebsiteDraft] = useState("");
  const [savingWebsite, setSavingWebsite] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [editingContactEmail, setEditingContactEmail] = useState(false);
  const [contactEmailDraft, setContactEmailDraft] = useState("");
  const [savingContactEmail, setSavingContactEmail] = useState(false);
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const { tags: knownTags } = useTagIndex();

  async function handleSaveMenuUrl() {
    if (!lead) return;
    setSavingMenuUrl(true);
    try {
      const patch = { menu_url: menuUrlDraft.trim() || null };
      await updateLeadFields(lead.id, patch);
      applyLeadPatchToCache(queryClient, lead.id, patch);
      setOverrides((prev) => ({ ...prev, ...patch }));
      setEditingMenuUrl(false);
      toast.success("Menu URL saved");
    } catch (err) {
      toast.error("Couldn't save menu URL", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingMenuUrl(false);
    }
  }

  async function handleSaveWebsite() {
    if (!lead) return;
    setSavingWebsite(true);
    try {
      let url = websiteDraft.trim();
      if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
      const patch = { website: url || null };
      await updateLeadFields(lead.id, patch);
      applyLeadPatchToCache(queryClient, lead.id, patch);
      setOverrides((prev) => ({ ...prev, ...patch }));
      setEditingWebsite(false);
      toast.success(url ? "Website saved" : "Website cleared");
    } catch (err) {
      toast.error("Couldn't save website", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingWebsite(false);
    }
  }

  async function handleSaveName() {
    if (!lead) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      toast.error("Business name can't be empty");
      return;
    }
    setSavingName(true);
    try {
      const patch = {
        business_name: trimmed,
        business_name_lower: trimmed.toLowerCase(),
      };
      await updateLeadFields(lead.id, patch);
      applyLeadPatchToCache(queryClient, lead.id, patch);
      setOverrides((prev) => ({ ...prev, ...patch }));
      setEditingName(false);
      toast.success("Business name saved");
    } catch (err) {
      toast.error("Couldn't save name", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveEmail() {
    if (!lead) return;
    const trimmed = emailDraft.trim();
    if (trimmed && !EMAIL_REGEX.test(trimmed)) {
      toast.error("Invalid email address");
      return;
    }
    setSavingEmail(true);
    try {
      const patch = { email: trimmed || null };
      await updateLeadFields(lead.id, patch);
      applyLeadPatchToCache(queryClient, lead.id, patch);
      setOverrides((prev) => ({ ...prev, ...patch }));
      setEditingEmail(false);
      toast.success(trimmed ? "Email saved" : "Email cleared");
    } catch (err) {
      toast.error("Couldn't save email", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSaveContactEmail() {
    if (!lead) return;
    const trimmed = contactEmailDraft.trim();
    if (trimmed && !EMAIL_REGEX.test(trimmed)) {
      toast.error("Invalid contact email address");
      return;
    }
    setSavingContactEmail(true);
    try {
      const patch = { contact_email: trimmed || null };
      await updateLeadFields(lead.id, patch);
      applyLeadPatchToCache(queryClient, lead.id, patch);
      setOverrides((prev) => ({ ...prev, ...patch }));
      setEditingContactEmail(false);
      toast.success(trimmed ? "Contact email saved" : "Contact email cleared");
    } catch (err) {
      toast.error("Couldn't save contact email", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingContactEmail(false);
    }
  }

  async function handleSaveCategory(next: string) {
    if (!lead) return;
    setSavingCategory(true);
    try {
      // `enrichment.venue_category` lives nested in the doc, so it can't go in
      // the patch we hand the cache helper (which spreads top-level fields).
      // The Firestore write does need it cleared, but the cached view just
      // needs the top-level field updated.
      await updateLeadFields(lead.id, {
        venue_category: next,
        "enrichment.venue_category": null,
      });
      applyLeadPatchToCache(queryClient, lead.id, { venue_category: next });
      setOverrides((prev) => ({ ...prev, venue_category: next }));
      setEditingCategory(false);
      toast.success("Category saved");
    } catch (err) {
      toast.error("Couldn't save category", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleTagsChange(nextTags: string[]) {
    if (!lead) return;
    setSavingTags(true);
    try {
      const patch = { tags: nextTags };
      await updateLeadFields(lead.id, patch);
      applyLeadPatchToCache(queryClient, lead.id, patch);
      setOverrides((prev) => ({ ...prev, ...patch }));
    } catch (err) {
      toast.error("Couldn't save tags", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingTags(false);
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
    // Route through scrape-now so we get the full Gemini+grounding pipeline
    // synchronously (45-120s) and the dialog refreshes when it returns.
    scrapeLead.mutate(lead.id, {
      onSuccess: () => {
        setEnrichDone(true);
        // Auto-revert the "Done!" label after a short delay so the button
        // is reusable for another retry.
        window.setTimeout(() => setEnrichDone(false), 2500);
      },
    });
  }

  if (!lead) return null;

  return (
    <>
      {/* Backdrop — lighter than the old modal blur so the page behind stays
          legible. Clicking it closes the drawer. */}
      <div
        className="fixed inset-0 z-40 bg-black/30 animate-in fade-in duration-150"
        onClick={onClose}
      />
      {/* Right-side drawer. Full width on mobile, 760px on desktop. Sticky
          header + scrollable middle + sticky footer so the close button and
          re-enrich action stay reachable while scrolling long enrichment. */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full md:w-[760px] flex-col border-l border-border/50 bg-card shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Sticky header bar */}
        <div className="shrink-0 flex items-center justify-between border-b border-border/50 bg-card px-4 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Lead detail
          </span>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Scrollable middle */}
        <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="p-5 pb-4">
          {editingName ? (
            <div className="flex items-center gap-1.5 pr-8">
              <input
                autoFocus
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                placeholder="Business name"
                className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-1 text-lg font-semibold"
              />
              <button
                onClick={handleSaveName}
                disabled={savingName}
                className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-60"
                title="Save"
              >
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <h2 className="pr-8 text-lg font-semibold flex items-center gap-1.5 group">
              <span>{lead.business_name}</span>
              <button
                onClick={() => { setNameDraft(lead.business_name ?? ""); setEditingName(true); }}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
                title="Rename"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </h2>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
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

        {/* Tags */}
        <div className="p-5 space-y-2">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Tag className="h-3 w-3" /> Tags
            {savingTags && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />
            )}
          </h3>
          <TagInput
            value={lead.tags ?? []}
            onChange={handleTagsChange}
            knownTags={knownTags}
            disabled={savingTags}
          />
          {(lead.auto_tags?.length ?? 0) > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Auto
              </p>
              <AutoTagChips tags={lead.auto_tags ?? []} />
              {lead.thread_rating_reason && (
                <p className="pt-0.5 text-[11px] italic text-muted-foreground">
                  “{lead.thread_rating_reason}”
                </p>
              )}
            </div>
          )}
        </div>

        <div className="border-t" />

        {/* Conversation thread */}
        <div className="p-5 space-y-2">
          <LeadConversationHeader />
          <LeadConversation leadId={lead.id} />
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
          <Row label="Category">
            {editingCategory ? (
              <span className="flex items-center gap-1.5">
                <Select
                  value={categoryDraft}
                  onValueChange={(v) => {
                    const next = typeof v === "string" ? v : "";
                    setCategoryDraft(next);
                    if (next) handleSaveCategory(next);
                  }}
                >
                  <SelectTrigger size="sm" className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {VENUE_CATEGORIES.map((slug) => (
                      <SelectItem key={slug} value={slug}>
                        {formatCategoryLabel(slug)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => setEditingCategory(false)}
                  disabled={savingCategory}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                {lead.venue_category ? (
                  <span className="text-sm capitalize">{lead.venue_category.replace(/_/g, " ")}</span>
                ) : (
                  <span className="text-muted-foreground text-sm">Not set</span>
                )}
                <button
                  onClick={() => {
                    setCategoryDraft(lead.venue_category ?? "");
                    setEditingCategory(true);
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit category"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </span>
            )}
          </Row>
          <Row label="Email">
            {editingEmail ? (
              <span className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="name@example.com"
                  className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-0.5 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveEmail(); if (e.key === "Escape") setEditingEmail(false); }}
                />
                <button
                  onClick={handleSaveEmail}
                  disabled={savingEmail}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-60"
                >
                  {savingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setEditingEmail(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : lead.email ? (
              <span className="flex items-center gap-1.5">
                <a href={`mailto:${lead.email}`} className="text-primary hover:underline flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {lead.email}
                </a>
                <button
                  onClick={() => { setEmailDraft(lead.email ?? ""); setEditingEmail(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit email"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-sm">Not set</span>
                <button
                  onClick={() => { setEmailDraft(""); setEditingEmail(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Add email"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </span>
            )}
          </Row>
          <Row label="Contact email">
            {editingContactEmail ? (
              <span className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="email"
                  value={contactEmailDraft}
                  onChange={(e) => setContactEmailDraft(e.target.value)}
                  placeholder="name@example.com"
                  className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-0.5 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveContactEmail(); if (e.key === "Escape") setEditingContactEmail(false); }}
                />
                <button
                  onClick={handleSaveContactEmail}
                  disabled={savingContactEmail}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-60"
                >
                  {savingContactEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setEditingContactEmail(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : lead.contact_email ? (
              <span className="flex items-center gap-1.5">
                <a href={`mailto:${lead.contact_email}`} className="text-primary hover:underline flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {lead.contact_email}
                </a>
                <button
                  onClick={() => { setContactEmailDraft(lead.contact_email ?? ""); setEditingContactEmail(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit contact email"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-sm">(not set)</span>
                <button
                  onClick={() => { setContactEmailDraft(""); setEditingContactEmail(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Add contact email"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </span>
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
            {editingWebsite ? (
              <span className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="url"
                  value={websiteDraft}
                  onChange={(e) => setWebsiteDraft(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 min-w-0 rounded border border-input bg-background px-2 py-0.5 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveWebsite(); if (e.key === "Escape") setEditingWebsite(false); }}
                />
                <button
                  onClick={handleSaveWebsite}
                  disabled={savingWebsite}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-60"
                >
                  {savingWebsite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setEditingWebsite(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : lead.website ? (
              <span className="flex items-center gap-1.5">
                <a href={lead.website} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  {lead.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 35)}
                </a>
                <button
                  onClick={() => { setWebsiteDraft(lead.website ?? ""); setEditingWebsite(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit website"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-sm">Not set</span>
                <button
                  onClick={() => { setWebsiteDraft(""); setEditingWebsite(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Add website"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </span>
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
                    className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-60"
                  >
                    {savingMenuUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
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

        </div>{/* end scrollable middle */}

        {/* Sticky footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border/50 bg-card p-3">
          <div className="flex items-center gap-3 min-w-0">
            {onEmail && lead?.email && (
              <Button
                size="sm"
                onClick={() => onEmail(lead)}
                className="shrink-0"
              >
                <Mail className="mr-1.5 h-3.5 w-3.5" />
                Email
              </Button>
            )}
            <p className="text-[11px] leading-tight text-muted-foreground line-clamp-2">
              Re-enrich runs the full research pipeline: Gemini searches the web
              for this business, then enriches from any website / Maps listing it
              finds. Takes 30–90 s.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReEnrich}
            disabled={scrapeLead.isPending}
            className="shrink-0"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${scrapeLead.isPending ? "animate-spin" : ""}`} />
            {scrapeLead.isPending ? "Researching…" : enrichDone ? "Done!" : "Re-enrich"}
          </Button>
        </div>
      </div>
    </>
  );
}
