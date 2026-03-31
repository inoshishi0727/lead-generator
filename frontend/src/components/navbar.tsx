"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BarChart3, Mail, Search, Settings, TrendingUp, LogOut, User, HelpCircle } from "lucide-react";
import { useTour } from "@/components/tour-provider";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const pathname = usePathname();
  const { displayName, role, signOut, isAdmin } = useAuth();
  const { start: startTour } = useTour();

  const links = [
    { href: "/", label: "Dashboard", icon: BarChart3, show: true },
    { href: "/leads", label: "Leads", icon: Search, show: true },
    { href: "/outreach", label: "Outreach", icon: Mail, show: true },
    { href: "/analytics", label: "Analytics", icon: TrendingUp, show: true },
    { href: "/settings", label: "Settings", icon: Settings, show: true },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-8 px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Asterley Bros
        </Link>
        <nav className="flex gap-0.5">
          {links.filter(l => l.show).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                pathname === href
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{displayName}</span>
            {role && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize">
                {role}
              </span>
            )}
          </div>
          <Link
            href="/help"
            data-tour="help-button"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Help & FAQ"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </Link>
          <button
            onClick={startTour}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Take a tour"
          >
            Tour
          </button>
          <DarkModeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {/* Active indicator line */}
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex gap-0.5">
          {links.filter(l => l.show).map(({ href }) => (
            <div
              key={href}
              className={cn(
                "h-[2px] transition-colors",
                pathname === href ? "bg-primary" : "bg-transparent"
              )}
              style={{ width: "auto", flex: pathname === href ? 1 : 0 }}
            />
          ))}
        </div>
      </div>
    </header>
  );
}
