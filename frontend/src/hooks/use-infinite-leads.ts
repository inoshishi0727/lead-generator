/**
 * useInfiniteLeads — cursor-paginated leads via TanStack `useInfiniteQuery` and
 * Firestore `startAfter`. The page wraps server-side filters (source / stage /
 * assignedTo); everything else the /leads UI offers (search substring, fit,
 * category, postcode, tag, recency, sort) keeps running over `pages.flat()`.
 *
 * useTopHotLeads — independent top-N query for the dashboard "Hot New Leads"
 * card so the dashboard never has to pull a full lead array.
 */
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import {
  getLeadsPage,
  getHotLeads,
  type LeadsPage,
  type LeadsPageFilters,
} from "@/lib/firestore-api";
import type { Lead } from "@/lib/types";

export const LEADS_PAGE_SIZE = 50;
export const LEADS_MIN_PAGE_SIZE = 10;

export function useInfiniteLeads(opts: {
  filters?: LeadsPageFilters;
  pageSize?: number;
  enabled?: boolean;
}) {
  const { filters = {}, pageSize = LEADS_PAGE_SIZE, enabled = true } = opts;
  return useInfiniteQuery<LeadsPage>({
    queryKey: ["leads", "infinite", filters, pageSize],
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      getLeadsPage({
        filters,
        pageSize,
        cursor: pageParam as LeadsPage["nextCursor"],
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 15_000,
  });
}

export function useTopHotLeads(opts: { assignedTo?: string; limit?: number; enabled?: boolean }) {
  const { assignedTo, limit = 20, enabled = true } = opts;
  return useQuery<Lead[]>({
    queryKey: ["leads", "top-hot", assignedTo ?? null, limit],
    queryFn: () => getHotLeads({ assignedTo, limit }),
    enabled,
    staleTime: 30_000,
  });
}
