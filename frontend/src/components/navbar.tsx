"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BarChart3, Mail, Search, Settings, TrendingUp } from "lucide-react";
import { DarkModeToggle } from "@/components/dark-mode-toggle";

const links = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/leads", label: "Leads", icon: Search },
  { href: "/outreach", label: "Outreach", icon: Mail },
  { href: "/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-8 px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Asterley Bros
        </Link>
        <nav className="flex gap-0.5">
          {links.map(({ href, label, icon: Icon }) => (
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
              {pathname === href && (
                <span className="sr-only">(current)</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <DarkModeToggle />
        </div>
      </div>
      {/* Active indicator line */}
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex gap-0.5">
          {links.map(({ href }) => (
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
