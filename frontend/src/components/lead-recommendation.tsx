"use client";

import { Sparkles, Mail, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadRecommendation } from "@/hooks/use-recommendations";

interface Props {
  leadId: string;
}

export function LeadRecommendationPanel({ leadId }: Props) {
  const { data, isLoading, error } = useLeadRecommendation(leadId);

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Could not load recommendation.
      </p>
    );
  }

  const confidencePct = Math.round(data.confidence * 100);
  const ChannelIcon = data.outreach_channel === "email" ? Mail : MessageCircle;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-purple-500" />
        AI Outreach Recommendation
        <span className="ml-auto text-xs text-muted-foreground">
          {confidencePct}% confidence
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Lead Product</p>
          <Badge variant="secondary">{data.lead_product}</Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Channel</p>
          <div className="flex items-center gap-1">
            <ChannelIcon className="h-3.5 w-3.5" />
            <span className="capitalize">{data.outreach_channel.replace("_", " ")}</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Tone</p>
          <span className="capitalize">{data.tone_tier.replace(/_/g, " ")}</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Timing</p>
          <span>{data.timing_note}</span>
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Opening Hook</p>
        <p className="text-sm italic text-foreground/80">
          &ldquo;{data.opening_hook}&rdquo;
        </p>
      </div>

      {/* Confidence bar */}
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-purple-500 transition-all"
          style={{ width: `${confidencePct}%` }}
        />
      </div>
    </div>
  );
}
