"use client";

import { useRef, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { useTheme } from "@/components/theme-provider";

const CRUMB_MAP: Record<string, string> = {
  "/": "Dashboard",
  "/leads": "Leads",
  "/clients": "Clients",
  "/campaigns": "Campaigns",
  "/outreach": "Outreach",
  "/analytics": "Analytics",
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

  function handleSearchSubmit(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim()) {
      router.push(`/leads?q=${encodeURIComponent(query.trim())}`);
      setQuery("");
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
    }
  }

  return (
    <div className="sp-app">
      <AppSidebar />
      <div className="sp-main">
        <div className="sp-topbar">
          <div className="sp-crumb">
            Workspace · <b>{label}</b>
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
          <div className="sp-topbar-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              placeholder="Search leads, emails, venues…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchSubmit}
            />
            <kbd>⌘K</kbd>
          </div>
        </div>
        <div className="sp-content">
          {children}
        </div>
      </div>
    </div>
  );
}
