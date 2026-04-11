"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import {
  inviteUser,
  getTeamMembers,
  removeTeamMember,
} from "@/lib/auth-admin";
import {
  Users,
  UserPlus,
  Loader2,
  Trash2,
  Copy,
  Check,
} from "lucide-react";

export function TeamManager() {
  const { workspaceId } = useAuth();
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const teamQuery = useQuery({
    queryKey: ["team", workspaceId],
    queryFn: () => getTeamMembers(workspaceId ?? ""),
    enabled: !!workspaceId,
  });

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; display_name: string; role: "admin" | "member" | "viewer" }) =>
      inviteUser(data.email, data.display_name, data.role, workspaceId ?? ""),
    onSuccess: (data) => {
      setTempPassword(data.tempPassword);
      setEmail("");
      setName("");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (uid: string) => removeTeamMember(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setTempPassword(null);
    inviteMutation.mutate({
      email: email.trim(),
      display_name: name.trim(),
      role,
    });
  }

  function handleCopyPassword() {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const members = teamQuery.data ?? [];

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
              onChange={(e) => setRole(e.target.value as "admin" | "member" | "viewer")}
              className="rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
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

        {/* Temp password after invite */}
        {tempPassword && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <p className="text-xs text-emerald-400 font-medium">
              User invited! They'll get a password reset email. Temporary password:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono">
                {tempPassword}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyPassword}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              They can use this to sign in, or check their email for a reset link to set their own.
            </p>
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
