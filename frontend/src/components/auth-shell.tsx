"use client";

import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Navbar } from "@/components/navbar";
import { TourProvider } from "@/components/tour-provider";
import { AppTour } from "@/components/app-tour";
import { GettingStarted } from "@/components/getting-started";

// Routes accessible without logging in
const PUBLIC_ROUTES = ["/login", "/help"];

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

  // Login page — always standalone
  if (pathname === "/login") {
    return <>{children}</>;
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

  // Logged in — show navbar + onboarding + tour + content
  return (
    <TourProvider>
      <Navbar />
      <GettingStarted />
      <AppTour />
      {children}
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
