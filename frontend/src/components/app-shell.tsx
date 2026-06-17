"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { useTheme } from "@/components/theme-provider";
import { AutocompleteInput, type Suggestion } from "@/components/autocomplete-input";
import { useLeads } from "@/hooks/use-leads";

const CRUMB_MAP: Record<string, string> = {
  "/": "Dashboard",
  "/leads": "Leads",
  "/clients": "Clients",
  "/campaigns": "Campaigns",
  "/outreach": "Outreach",
  "/conversations": "Sommelier",
  "/analytics": "Analytics",
  "/analytics/cost": "AI Cost",
  "/log": "Diagnostics",
  "/scrapes": "Scrapes",
  "/settings": "Settings",
  "/help": "Help",
};

function getLabel(pathname: string) {
  if (CRUMB_MAP[pathname]) return CRUMB_MAP[pathname];
  const base = "/" + pathname.split("/")[1];
  return CRUMB_MAP[base] ?? pathname;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const label = getLabel(pathname);
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { data: allLeads = [] } = useLeads();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const globalSuggestions: Suggestion[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || allLeads.length === 0) return [];
    const matches: { lead: typeof allLeads[number]; weight: number }[] = [];
    for (const lead of allLeads) {
      const name = (lead.business_name ?? "").toLowerCase();
      const email = (lead.email ?? "").toLowerCase();
      const area = (lead.location_area ?? lead.location_city ?? "").toLowerCase();
      if (!name && !email) continue;
      if (name.startsWith(q)) matches.push({ lead, weight: 0 });
      else if (name.includes(q)) matches.push({ lead, weight: 1 });
      else if (email.includes(q)) matches.push({ lead, weight: 2 });
      else if (area.includes(q)) matches.push({ lead, weight: 3 });
      if (matches.length >= 60) break;
    }
    matches.sort((a, b) => a.weight - b.weight);
    return matches.slice(0, 8).map(({ lead }) => ({
      id: lead.id,
      label: lead.business_name || "(unnamed)",
      sublabel: [lead.email, lead.location_area || lead.location_city].filter(Boolean).join(" · ") || undefined,
      meta: lead.venue_category?.replace(/_/g, " ") ?? undefined,
    }));
  }, [query, allLeads]);

  const isEmulator = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

  return (
    <div className="sp-app">
      <AppSidebar />
      <div className="sp-main">
        {isEmulator && (
          <div
            style={{
              background: "#f59e0b",
              color: "#1c1917",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "4px 12px",
              textAlign: "center",
              borderBottom: "1px solid #b45309",
            }}
          >
            Emulator mode · local Firestore + Auth · demo data only · no production reads
          </div>
        )}
        <div className="sp-topbar">
          <div className="sp-crumb">
            Workspace · <b>{label}</b>
            {isEmulator && (
              <span
                style={{
                  marginLeft: 8,
                  background: "#fef3c7",
                  color: "#92400e",
                  border: "1px solid #fbbf24",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  letterSpacing: "0.04em",
                }}
              >
                EMULATOR
              </span>
            )}
          </div>
          <div className="sp-spacer" />
          <button
            onClick={toggle}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 6,
              border: '1px solid var(--sp-line-strong)',
              background: 'transparent', cursor: 'pointer', color: 'var(--sp-ink-3)',
              marginRight: 8, flexShrink: 0,
            }}
          >
            {theme === "dark" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <div className="sp-topbar-search" style={{ position: "relative" }}>
            <AutocompleteInput
              inputRef={inputRef}
              value={query}
              onChange={setQuery}
              suggestions={globalSuggestions}
              placeholder="Search leads, emails, venues…"
              onSelect={(s) => {
                router.push(`/leads?focus=${encodeURIComponent(s.id)}`);
                setQuery("");
                inputRef.current?.blur();
              }}
              onSubmit={(v) => {
                router.push(`/leads?q=${encodeURIComponent(v)}`);
                setQuery("");
                inputRef.current?.blur();
              }}
            />
          </div>
        </div>
        <div className="sp-content">
          {children}
        </div>
      </div>
    </div>
  );
}
