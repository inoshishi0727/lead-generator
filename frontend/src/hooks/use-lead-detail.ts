import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLeadById } from "@/lib/firestore-api";
import { markViewed } from "@/lib/lead-viewed";
import { useAuth } from "@/lib/auth-context";

export function useLeadDetail(id: string) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const markedRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ["lead", id],
    queryFn: () => getLeadById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!id || !uid) return;
    if (!query.data) return;
    if (markedRef.current === id) return;
    markedRef.current = id;
    markViewed(id, uid);
  }, [id, uid, query.data]);

  return query;
}
