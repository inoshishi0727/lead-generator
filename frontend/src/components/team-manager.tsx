"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Users,
  UserPlus,
  Loader2,
  Trash2,
  Copy,
  Check,
} from "lucide-react";

interface TeamMember {
  uid: string;
  email: string;
  display_name: string;
  role: string;
  workspace_id: string;
}

const hasBackend = !!process.env.NEXT_PUBLIC_API_URL;

export function TeamManager() {
  const { workspaceId } = useAuth();
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const teamQuery = useQuery({
    queryKey: ["team", workspaceId],
    queryFn: () =>
      api.get<{ members: TeamMember[] }>(
        `/api/auth/team?workspace_id=${workspaceId ?? ""}`
      ),
    enabled: hasBackend && !!workspaceId,
  });

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; display_name: string; role: string }) =>
      api.post<{ uid: string; email: string; reset_link: string }>(
        "/api/auth/invite",
        { ...data, workspace_id: workspaceId ?? "" }
      ),
    onSuccess: (data) => {
      setResetLink(data.reset_link);
      setEmail("");
      setName("");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (uid: string) => api.post(`/api/auth/team/${uid}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setResetLink(null);
    inviteMutation.mutate({
      email: email.trim(),
      display_name: name.trim(),
      role,
    });
  }

  function handleCopyLink() {
    if (resetLink) {
      navigator.clipboard.writeText(resetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const members = teamQuery.data?.members ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" />
          Team
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current members */}
        {members.length > 0 && (
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.uid}
                className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{m.display_name || m.email}</span>
                  <span className="text-xs text-muted-foreground">{m.email}</span>
                  <Badge
                    variant={m.role === "admin" ? "default" : "secondary"}
                    className="text-[10px] capitalize"
                  >
                    {m.role}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMutation.mutate(m.uid)}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Invite form */}
        <form onSubmit={handleInvite} className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Invite a new team member</p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1"
            />
            <Input
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-36"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "viewer")}
              className="rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <Button
              type="submit"
              size="sm"
              disabled={inviteMutation.isPending || !email.trim()}
            >
              {inviteMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="mr-1 h-3.5 w-3.5" />
              )}
              Invite
            </Button>
          </div>
        </form>

        {/* Reset link after invite */}
        {resetLink && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <p className="text-xs text-emerald-400 font-medium">
              User invited. Send them this password reset link:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-2 py-1 text-xs break-all">
                {resetLink}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyLink}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {inviteMutation.isError && (
          <p className="text-sm text-destructive">
            {(inviteMutation.error as any)?.message ?? "Failed to invite user."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
