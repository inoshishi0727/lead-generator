"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTeamMetrics } from "@/hooks/use-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Eye, MessageCircle, Check, Users } from "lucide-react";

function StatBox({
  label,
  value,
  icon: Icon,
  suffix = "",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-lg bg-muted/50 p-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">
          {value}{suffix}
        </p>
      </div>
    </div>
  );
}

export default function TeamAnalyticsPage() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const { data: metrics = [], isLoading } = useTeamMetrics();

  if (loading || isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Team Metrics</h1>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-50 dark:bg-red-950/20 p-4">
        <p className="text-sm text-red-700 dark:text-red-400">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Metrics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Individual team member performance overview. Metrics include leads assigned, emails sent, open rates, and conversions.
        </p>
      </div>

      {metrics.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No team members with activity yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {metrics.map((member) => (
            <Card key={member.uid} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">{member.display_name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{member.email}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize text-xs">
                    {member.role}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Main Stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <StatBox label="Assigned Leads" value={member.assigned_leads} icon={Users} />
                  <StatBox label="Emails Sent" value={member.emails_sent} icon={Mail} />
                  <StatBox label="Open Rate" value={member.open_rate} icon={Eye} suffix="%" />
                  <StatBox label="Replies" value={member.replies_received} icon={MessageCircle} />
                  <StatBox label="Reply Rate" value={member.reply_rate} suffix="%" icon={MessageCircle} />
                  <StatBox label="Converted" value={member.leads_converted} icon={Check} />
                </div>

                {/* Leads by Stage */}
                {Object.keys(member.leads_by_stage).length > 0 && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Leads by Stage</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(member.leads_by_stage)
                        .sort((a, b) => b[1] - a[1])
                        .map(([stage, count]) => (
                          <Badge key={stage} variant="outline" className="text-[11px]">
                            {stage}: {count}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
