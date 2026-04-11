"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getTeamMembers } from "@/lib/auth-admin";
import { useAssignLeads } from "@/hooks/use-assign-leads";
import { Loader2, Shuffle } from "lucide-react";
import { toast } from "sonner";
import type { Lead } from "@/lib/types";

interface Props {
  leads: Lead[];
  onDone: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function AssignRandomButton({ leads, onDone }: Props) {
  const { workspaceId } = useAuth();
  const [selectedUser, setSelectedUser] = useState("");
  const assignMutation = useAssignLeads();

  const teamQuery = useQuery({
    queryKey: ["team", workspaceId],
    queryFn: () => getTeamMembers(workspaceId ?? ""),
    enabled: !!workspaceId,
  });

  const members = (teamQuery.data ?? []).filter(
    (m) => m.role === "admin" || m.role === "member"
  );

  const unassigned = leads.filter((l) => !l.assigned_to);

  function handleAssignRandom() {
    if (!selectedUser || unassigned.length === 0) return;
    const picked = shuffle(unassigned).slice(0, 20);
    const ids = picked.map((l) => l.id);
    const memberName = members.find((m) => m.uid === selectedUser)?.display_name ?? "member";
    assignMutation.mutate(
      { lead_ids: ids, assigned_to: selectedUser },
      {
        onSuccess: () => {
          toast.success(`Assigned ${ids.length} random leads to ${memberName}`);
          onDone();
        },
      }
    );
  }

  if (unassigned.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedUser}
        onChange={(e) => setSelectedUser(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Pick member...</option>
        {members.map((m) => (
          <option key={m.uid} value={m.uid}>
            {m.display_name || m.email}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        onClick={handleAssignRandom}
        disabled={!selectedUser || assignMutation.isPending}
        className="h-8"
      >
        {assignMutation.isPending ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Shuffle className="mr-1 h-3.5 w-3.5" />
        )}
        Assign 20 Random ({Math.min(20, unassigned.length)} avail)
      </Button>
    </div>
  );
}
