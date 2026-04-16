"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Check } from "lucide-react";
import { getDocs, collection, query, orderBy } from "firebase/firestore";

interface PromptRuleVersion {
  version_id: string;
  rules_md: string;
  generated_at: string;
  feedback_count: number;
}

/**
 * Fetch all prompt rule versions ordered by generated_at desc
 */
async function getPromptRuleVersions(): Promise<PromptRuleVersion[]> {
  try {
    const versionsRef = collection(db, "prompt_config", "email_rules", "versions");
    const q = query(versionsRef, orderBy("generated_at", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ ...doc.data() } as PromptRuleVersion));
  } catch (err) {
    console.error("Failed to fetch prompt rule versions:", err);
    return [];
  }
}

/**
 * Fetch active version ID from pointer doc
 */
async function getActiveVersionId(): Promise<string | null> {
  try {
    const pointerSnap = await getDocs(collection(db, "prompt_config"));
    const pointerDoc = pointerSnap.docs.find((doc) => doc.id === "email_rules");
    return pointerDoc?.data()?.active_version_id || null;
  } catch (err) {
    console.error("Failed to fetch active version ID:", err);
    return null;
  }
}

export default function PromptRulesPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [settingVersion, setSettingVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: versions = [], isLoading: isLoadingVersions, refetch } = useQuery({
    queryKey: ["prompt-rules-versions"],
    queryFn: () => getPromptRuleVersions(),
    enabled: isAdmin,
  });

  // Load active version ID on mount
  useEffect(() => {
    if (isAdmin && !loading) {
      getActiveVersionId().then(setActiveVersionId);
    }
  }, [isAdmin, loading]);

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-50 dark:bg-red-950/20 p-4">
        <p className="text-sm text-red-700 dark:text-red-400">Admin access required</p>
      </div>
    );
  }

  async function handleSetActive(versionId: string) {
    setSettingVersion(versionId);
    setError(null);
    try {
      const fn = httpsCallable<{ version_id: string }, { status: string; version_id: string }>(
        functions,
        "setActivePromptVersion"
      );
      await fn({ version_id: versionId });
      setActiveVersionId(versionId);
      await refetch();
    } catch (err: any) {
      setError(err?.message || "Failed to set active version");
    } finally {
      setSettingVersion(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prompt Rules</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage synthesized writing rules generated from team feedback. Rules are automatically synthesized every Monday at 6am.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-50 dark:bg-red-950/20 p-4">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {isLoadingVersions ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : versions.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No prompt rule versions generated yet. Rules are synthesized every Monday at 6am UTC.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {versions.map((version) => {
            const isActive = version.version_id === activeVersionId;
            const generatedDate = new Date(version.generated_at);
            const formattedDate = generatedDate.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <Card key={version.version_id} className={isActive ? "border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold">{version.version_id}</CardTitle>
                        {isActive && (
                          <Badge variant="default" className="bg-emerald-600 text-white text-[10px]">
                            <Check className="h-2.5 w-2.5 mr-1" />
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Generated {formattedDate} • {version.feedback_count} feedbacks
                      </p>
                    </div>
                    {!isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSetActive(version.version_id)}
                        disabled={settingVersion === version.version_id}
                      >
                        {settingVersion === version.version_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : null}
                        {settingVersion === version.version_id ? "Setting..." : "Set as Active"}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-y-auto max-h-64 text-muted-foreground whitespace-pre-wrap break-words">
                    {version.rules_md}
                  </pre>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
