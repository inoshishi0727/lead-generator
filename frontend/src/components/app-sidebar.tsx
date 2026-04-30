"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  Mail,
  Megaphone,
  Search,
  Settings,
  TrendingUp,
  LogOut,
  Bell,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
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

function NotificationDropdown({
  replies,
  lastReadAt,
  onClose,
  onMarkRead,
}: {
  replies: ReplyNotification[];
  lastReadAt: string;
  onClose: () => void;
  onMarkRead: () => void;
}) {
  const router = useRouter();
  return (
    <div
      style={{
        position: "absolute",
        left: "calc(100% + 8px)",
        bottom: 0,
        width: 300,
        background: "var(--sp-bg-paper)",
        border: "1px solid var(--sp-line)",
        borderRadius: "var(--sp-radius-lg)",
        boxShadow: "var(--sp-shadow-md)",
        zIndex: 100,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid var(--sp-line)",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--sp-ink)" }}>
          Recent Replies
        </span>
        <button
          onClick={onMarkRead}
          style={{
            fontSize: 10,
            color: "var(--sp-ink-3)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Mark all read
        </button>
      </div>
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {replies.length === 0 ? (
          <p
            style={{
              padding: "16px 12px",
              fontSize: 12,
              color: "var(--sp-ink-3)",
              textAlign: "center",
            }}
          >
            No replies yet
          </p>
        ) : (
          replies.map((r) => {
            const isUnread = !lastReadAt || r.created_at > lastReadAt;
            return (
              <button
                key={r.id}
                onClick={() => {
                  onClose();
                  router.push("/outreach?tab=conversations");
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--sp-line)",
                  background: isUnread ? "var(--sp-accent-soft)" : "transparent",
                  borderLeft: isUnread ? "2px solid var(--sp-accent)" : "2px solid transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "block",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: isUnread ? 600 : 500,
                      color: "var(--sp-ink)",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.business_name || r.from_name || r.from_email}
                  </p>
                  <span
                    style={{ fontSize: 10, color: "var(--sp-ink-3)", flexShrink: 0 }}
                  >
                    {timeAgo(r.created_at)}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 10,
                    color: "var(--sp-ink-3)",
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.from_email}
                </p>
              </button>
            );
          })
        )}
      </div>
      {replies.length > 0 && (
        <div style={{ borderTop: "1px solid var(--sp-line)", padding: "8px 12px" }}>
          <button
            onClick={() => {
              onClose();
              router.push("/outreach?tab=conversations");
            }}
            style={{
              fontSize: 10,
              color: "var(--sp-accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            View all in Conversations →
          </button>
        </div>
      )}
    </div>
  );
}

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", Icon: BarChart3 },
  { href: "/leads", label: "Leads", Icon: Search },
  { href: "/clients", label: "Clients", Icon: Building2 },
  { href: "/campaigns", label: "Campaigns", Icon: Megaphone },
  { href: "/outreach", label: "Outreach", Icon: Mail },
  { href: "/analytics", label: "Analytics", Icon: TrendingUp },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { displayName, signOut } = useAuth();
  const { unreadCount, replies, lastReadAt, markAllRead } =
    useReplyNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <aside className="sp-sidebar">
      {/* Brand */}
      <div className="sp-brand">
        <div className="sp-brand-mark">AB</div>
        <div>
          <div className="sp-brand-name">Asterley Bros</div>
          <div className="sp-brand-sub">Wholesale</div>
        </div>
      </div>

      <div className="sp-nav-section-label">Workspace</div>

      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const badge =
          href === "/outreach" && unreadCount > 0 ? unreadCount : null;
        return (
          <Link
            key={href}
            href={href}
            className={`sp-nav-item${isActive ? " active" : ""}`}
          >
            <Icon size={15} />
            <span>{label}</span>
            {badge && <span className="sp-nav-badge">{badge}</span>}
          </Link>
        );
      })}

      {/* Footer */}
      <div className="sp-sidebar-footer">
        {/* Avatar */}
        <div
          className="sp-avatar"
          style={{
            width: 28,
            height: 28,
            fontSize: 11,
            background: "oklch(0.45 0.15 265)",
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{ fontSize: 12, fontWeight: 500, color: "var(--sp-ink)" }}
          >
            {displayName || "—"}
          </div>
        </div>

        {/* Bell */}
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            className="sp-icon-btn"
            onClick={() => setNotifOpen((o) => !o)}
            title="Reply notifications"
            style={{ position: "relative" }}
          >
            <Bell size={14} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--sp-bad)",
                  border: "1.5px solid var(--sp-bg-paper)",
                }}
              />
            )}
          </button>
          {notifOpen && (
            <NotificationDropdown
              replies={replies}
              lastReadAt={lastReadAt}
              onClose={() => setNotifOpen(false)}
              onMarkRead={() => {
                markAllRead();
                setNotifOpen(false);
              }}
            />
          )}
        </div>

        <Link
          href="/help"
          className="sp-icon-btn"
          title="Help"
        >
          <HelpCircle size={14} />
        </Link>

        <button
          className="sp-icon-btn"
          onClick={() => signOut()}
          title="Sign out"
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
