"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  LogOut,
  Bell,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useReplyNotifications } from "@/hooks/use-notifications";
import type { ReplyNotification } from "@/lib/firestore-api";
import {
  WORKSPACE_NAV,
  SYSTEM_NAV,
  isNavItemActive,
  isExactNavItemActive,
  type NavItem,
} from "@/lib/nav-items";

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

function NavEntry({
  item,
  pathname,
  currentTab,
  unreadCount,
  isAdmin,
}: {
  item: NavItem;
  pathname: string;
  currentTab: string | null;
  unreadCount: number;
  isAdmin: boolean;
}) {
  const isActive = isNavItemActive(item.href, pathname, currentTab);
  const badge =
    item.badgeKey === "outreachReplies" && unreadCount > 0 ? unreadCount : null;
  const { Icon } = item;

  // Show children when the parent or any child route is active. That way the
  // sub-menu only takes space when the user is already in that part of the app.
  const visibleChildren = (item.children ?? []).filter((c) => !c.adminOnly || isAdmin);
  const showChildren = isActive && visibleChildren.length > 0;

  return (
    <>
      <Link
        key={item.href}
        href={item.href}
        className={`sp-nav-item${isActive ? " active" : ""}`}
      >
        <Icon size={15} />
        <span>{item.label}</span>
        {badge && <span className="sp-nav-badge">{badge}</span>}
      </Link>
      {showChildren && visibleChildren.map((child) => {
        const ChildIcon = child.Icon;
        const childActive = isExactNavItemActive(child.href, pathname);
        return (
          <Link
            key={child.href}
            href={child.href}
            className={`sp-nav-item${childActive ? " active" : ""}`}
            style={{ paddingLeft: 32, fontSize: 12 }}
          >
            <ChildIcon size={13} />
            <span>{child.label}</span>
          </Link>
        );
      })}
    </>
  );
}

function SidebarNav({
  unreadCount,
  isAdmin,
}: {
  unreadCount: number;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");

  return (
    <>
      <div className="sp-nav-section-label">Workspace</div>
      {WORKSPACE_NAV.map((item) => (
        <NavEntry
          key={item.href}
          item={item}
          pathname={pathname}
          currentTab={currentTab}
          unreadCount={unreadCount}
          isAdmin={isAdmin}
        />
      ))}

      <div className="sp-nav-section-label" style={{ marginTop: 16 }}>
        System
      </div>
      {SYSTEM_NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
        <NavEntry
          key={item.href}
          item={item}
          pathname={pathname}
          currentTab={currentTab}
          unreadCount={unreadCount}
          isAdmin={isAdmin}
        />
      ))}
    </>
  );
}

export function AppSidebar() {
  const { displayName, signOut, isAdmin } = useAuth();
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

      <Suspense fallback={<div className="sp-nav-section-label">Workspace</div>}>
        <SidebarNav unreadCount={unreadCount} isAdmin={isAdmin} />
      </Suspense>

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
