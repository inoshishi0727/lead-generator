"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EnvStatus } from "@/components/env-status";
import { SearchQueriesList } from "@/components/search-queries-list";
import { RatioManager } from "@/components/ratio-manager";
import { SuggestedQueries } from "@/components/suggested-queries";
import { TeamManager } from "@/components/team-manager";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { useConfig } from "@/hooks/use-config";
import { useAuth } from "@/lib/auth-context";
import { sendPasswordResetEmail, updatePassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { KeyRound, Loader2, Check } from "lucide-react";

export default function SettingsPage() {
  const { isAdmin, loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, loading, router]);

  const { data: config, isLoading } = useConfig();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [passwordError, setPasswordError] = useState("");

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    setPasswordError("");
    setPasswordStatus("saving");
    try {
      if (user) {
        await updatePassword(user, newPassword);
        setPasswordStatus("done");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPasswordStatus("idle"), 3000);
      }
    } catch (err: any) {
      if (err?.code === "auth/requires-recent-login") {
        setPasswordError("Please sign out and sign back in, then try again.");
      } else {
        setPasswordError("Failed to update password. Try again.");
      }
      setPasswordStatus("error");
    }
  }

  if (loading || isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {/* Team Management */}
      <TeamManager />

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">New Password</label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Confirm Password</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
            {passwordStatus === "done" && (
              <p className="flex items-center gap-1 text-sm text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                Password updated.
              </p>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={passwordStatus === "saving" || !newPassword || !confirmPassword}
            >
              {passwordStatus === "saving" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              )}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing settings */}
      {config && (
        <>
          <EnvStatus envVars={config.env_vars} />
          <SearchQueriesList queries={config.search_queries} />
          <RatioManager />
          <SuggestedQueries />
        </>
      )}
    </div>
  );
}
