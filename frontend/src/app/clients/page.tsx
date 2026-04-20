"use client";

import { useQuery } from "@tanstack/react-query";
import { getClients } from "@/lib/firestore-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, ExternalLink } from "lucide-react";
import type { Lead } from "@/lib/types";

export default function ClientsPage() {
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: getClients,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${clients.length} active client${clients.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <Card className="py-12 text-center text-muted-foreground">
          <Building2 className="mx-auto mb-3 h-8 w-8 opacity-30" />
          <p className="text-sm">No clients yet.</p>
          <p className="mt-1 text-xs">
            Mark a lead as a client using the{" "}
            <Building2 className="inline h-3 w-3" /> button in the Leads table.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientCard({ client }: { client: Lead }) {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate text-sm">{client.business_name}</p>
          {client.location_area && (
            <p className="text-xs text-muted-foreground truncate">{client.location_area}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {client.stage === "converted" ? (
            <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
              converted
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400 bg-purple-500/10">
              client
            </Badge>
          )}
        </div>
      </div>
      {client.venue_category && (
        <Badge variant="secondary" className="text-[10px] capitalize">
          {client.venue_category.replace(/_/g, " ")}
        </Badge>
      )}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {client.email && <span className="truncate">{client.email}</span>}
        {client.website && (
          <a
            href={client.website}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </Card>
  );
}
