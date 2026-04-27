"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BarChart3, Building2, Mail, Megaphone, Search, Settings, TrendingUp, LogOut, User, HelpCircle, Bell } from "lucide-react";
import { useTour } from "@/components/tour-provider";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useReplyNotifications } from "@/hooks/use-notifications";
import type { ReplyNotification } from "@/lib/firestore-api";

function timeAgo(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotificationDropdown({ replies, lastReadAt, onClose, onMarkRead }: {
  replies: ReplyNotification[];
  lastReadAt: string;
  onClose: () => void;
  onMarkRead: () => void;
}) {
  const router = useRouter();
  return (
    <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border/50 bg-card shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <span className="text-xs font-semibold">Recent Replies</span>
        <button
          onClick={onMarkRead}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Mark all read
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-border/30">
        {replies.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">No replies yet</p>
        ) : (
          replies.map((r) => {
            const isUnread = !lastReadAt || r.created_at > lastReadAt;
            return (
              <button
                key={r.id}
                onClick={() => { onClose(); router.push("/outreach"); }}
                className={cn(
                  "w-full text-left px-3 py-2.5 hover:bg-muted/30 transition-colors",
                  isUnread && "bg-primary/5 border-l-2 border-l-primary"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                      <p className={cn("text-xs truncate", isUnread ? "font-semibold" : "font-medium")}>
                        {r.business_name || r.from_name || r.from_email}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate pl-3">{r.from_email}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(r.created_at)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
      {replies.length > 0 && (
        <div className="border-t border-border/40 px-3 py-2">
          <button
            onClick={() => { onClose(); router.push("/outreach"); }}
            className="text-[10px] text-primary hover:underline"
          >
            View all in Conversations →
          </button>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { displayName, role, signOut } = useAuth();
  const { start: startTour } = useTour();
  const { unreadCount, replies, lastReadAt, markAllRead } = useReplyNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const links = [
    { href: "/", label: "Dashboard", icon: BarChart3, show: true },
    { href: "/leads", label: "Leads", icon: Search, show: true },
    { href: "/clients", label: "Clients", icon: Building2, show: true },
    { href: "/campaigns", label: "Campaigns", icon: Megaphone, show: true },
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
          {/* Reply notifications bell */}
          <div ref={bellRef} className="relative">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="relative text-muted-foreground hover:text-foreground transition-colors"
              title="Reply notifications"
            >
              <Bell className="h-3.5 w-3.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {dropdownOpen && (
              <NotificationDropdown
                replies={replies}
                lastReadAt={lastReadAt}
                onClose={() => setDropdownOpen(false)}
                onMarkRead={() => { markAllRead(); setDropdownOpen(false); }}
              />
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
