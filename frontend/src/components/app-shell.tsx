"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";

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

  return (
    <div className="sp-app">
      <AppSidebar />
      <div className="sp-main">
        <div className="sp-topbar">
          <div className="sp-crumb">
            Workspace · <b>{label}</b>
          </div>
          <div className="sp-spacer" />
          <div className="sp-topbar-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input placeholder="Search leads, emails, venues…" />
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
