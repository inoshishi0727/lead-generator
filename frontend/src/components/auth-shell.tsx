"use client";

import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { TourProvider } from "@/components/tour-provider";
import { AppTour } from "@/components/app-tour";
import { GettingStarted } from "@/components/getting-started";

// Routes accessible without logging in
const PUBLIC_ROUTES = ["/login", "/help"];

function EmulatorBanner() {
  if (process.env.NEXT_PUBLIC_USE_EMULATORS !== "true") return null;
  return (
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
      Emulator mode · local Firestore + Auth · demo data only
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Login page — always standalone (with emulator banner if active)
  if (pathname === "/login") {
    return (
      <>
        <EmulatorBanner />
        {children}
      </>
    );
  }

  // Public pages when NOT logged in — show standalone (no navbar)
  if (!user && PUBLIC_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  // Not logged in and not a public page — redirect to login
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Logged in — sidebar layout + onboarding + tour + content
  return (
    <TourProvider>
      <AppShell>
        <GettingStarted />
        <AppTour />
        {children}
      </AppShell>
    </TourProvider>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
