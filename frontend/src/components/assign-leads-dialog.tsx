"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getTeamMembers } from "@/lib/auth-admin";
import { useAssignLeads, useUnassignLeads } from "@/hooks/use-assign-leads";
import { Loader2, UserCheck, UserMinus } from "lucide-react";

interface AssignLeadsDialogProps {
  leadIds: string[];
  onDone: () => void;
}

export function AssignLeadsDialog({ leadIds, onDone }: AssignLeadsDialogProps) {
  const { workspaceId } = useAuth();
  const [selectedUser, setSelectedUser] = useState("");
  const assignMutation = useAssignLeads();
  const unassignMutation = useUnassignLeads();

  const teamQuery = useQuery({
    queryKey: ["team", workspaceId],
    queryFn: () => getTeamMembers(workspaceId ?? ""),
    enabled: !!workspaceId,
  });

  const members = (teamQuery.data ?? []).filter(
    (m) => m.role === "admin" || m.role === "member"
  );

  function handleAssign() {
    if (!selectedUser || leadIds.length === 0) return;
    assignMutation.mutate(
      { lead_ids: leadIds, assigned_to: selectedUser },
      { onSuccess: onDone }
    );
  }

  function handleUnassign() {
    if (leadIds.length === 0) return;
    unassignMutation.mutate(leadIds, { onSuccess: onDone });
  }

  const isPending = assignMutation.isPending || unassignMutation.isPending;

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedUser}
        onChange={(e) => setSelectedUser(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Assign to...</option>
        {members.map((m) => (
          <option key={m.uid} value={m.uid}>
            {m.display_name || m.email}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        onClick={handleAssign}
        disabled={!selectedUser || isPending}
        className="h-8"
      >
        {assignMutation.isPending ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <UserCheck className="mr-1 h-3.5 w-3.5" />
        )}
        Assign ({leadIds.length})
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleUnassign}
        disabled={isPending}
        className="h-8 text-muted-foreground"
      >
        {unassignMutation.isPending ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <UserMinus className="mr-1 h-3.5 w-3.5" />
        )}
        Unassign
      </Button>
    </div>
  );
}
