import { useQuery } from "@tanstack/react-query";
import { getLinkedInEmployees } from "@/lib/firestore-api";

export function useLinkedInEmployees(leadId: string) {
  return useQuery({
    queryKey: ["linkedin_employees", leadId],
    queryFn: () => getLinkedInEmployees(leadId),
    enabled: !!leadId,
    staleTime: 5 * 60 * 1000,
  });
}
