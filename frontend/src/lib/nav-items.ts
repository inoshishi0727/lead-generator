import {
  BarChart3,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  Megaphone,
  MessageCircle,
  Search,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/**
 * Outreach tab query-string constants. Used so deep-links from the sidebar
 * (Review, Inbox) and any future caller share one source of truth and can't
 * drift if the tab key changes.
 */
export const OUTREACH_TABS = {
  REVIEW: "draft",
  INBOX: "conversations",
  APPROVED: "approved",
  SCHEDULED: "scheduled",
  SENT: "sent",
  REJECTED: "rejected",
  FOLLOWUPS: "follow-ups",
  CLIENTS: "clients",
  ALL: "all",
} as const;

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** True if this entry should only render for admin users. */
  adminOnly?: boolean;
  /** Optional badge key — used by the sidebar to know where to mount unread counts. */
  badgeKey?: "outreachReplies";
}

/**
 * Workspace = daily operator surfaces (the things you click while doing your job).
 * Order matters — top to bottom is rough priority during a normal day.
 */
export const WORKSPACE_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", Icon: BarChart3 },
  { href: "/leads", label: "Leads", Icon: Search },
  { href: `/outreach?tab=${OUTREACH_TABS.REVIEW}`, label: "Review", Icon: ClipboardCheck },
  {
    href: `/outreach?tab=${OUTREACH_TABS.INBOX}`,
    label: "Inbox",
    Icon: Inbox,
    badgeKey: "outreachReplies",
  },
  { href: "/campaigns", label: "Campaigns", Icon: Megaphone },
  { href: "/clients", label: "Clients", Icon: Building2 },
  { href: "/analytics", label: "Analytics", Icon: TrendingUp },
];

/**
 * System = settings + read-only diagnostic surfaces (not part of the daily loop).
 * Sommelier = Shopify chat widget logs (renamed from the prior "Conversations"
 * label, which was confusing because outreach replies were ALSO called
 * "Conversations" inside Outreach).
 * Diagnostics = the prior "Log" sidebar entry; admin-only.
 */
export const SYSTEM_NAV: NavItem[] = [
  { href: "/settings", label: "Settings", Icon: Settings },
  { href: "/conversations", label: "Sommelier", Icon: MessageCircle },
  { href: "/log", label: "Diagnostics", Icon: ClipboardList, adminOnly: true },
];

/**
 * Helpers to determine whether a NavItem href matches the current pathname +
 * search params. Active-state for query-string entries (Review/Inbox) must
 * compare the tab as well, not just the path.
 */
export function isNavItemActive(
  href: string,
  pathname: string,
  currentTab: string | null,
): boolean {
  const [pathPart, queryPart] = href.split("?");

  if (queryPart) {
    if (pathname !== pathPart) return false;
    const expectedTab = new URLSearchParams(queryPart).get("tab");
    return expectedTab === currentTab;
  }

  if (pathPart === "/") return pathname === "/";

  // For path-only entries, only highlight when the path matches AND we're not
  // sitting on a sub-tab that another nav entry owns. Specifically, /outreach
  // with a tab query is owned by either Review or Inbox, not by a generic
  // "Outreach" entry (we no longer have one, but the guard is cheap insurance).
  if (pathname === "/outreach" && currentTab) return false;

  return pathname.startsWith(pathPart);
}
