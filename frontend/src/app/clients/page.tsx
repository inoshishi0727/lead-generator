"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClients } from "@/lib/firestore-api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { ClientEditDialog } from "@/components/client-edit-dialog";
import {
  Building2,
  ExternalLink,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MapPin,
  User,
  Pencil,
} from "lucide-react";
import type { Lead } from "@/lib/types";

type SortKey = "name" | "location" | "category" | "assigned_to";
type SortDir = "asc" | "desc";

// One distinct color per venue category — matches the palette used across the app
const CATEGORY_COLORS: Record<string, string> = {
  cocktail_bar:       "border-violet-500/30 text-violet-400 bg-violet-500/10",
  wine_bar:           "border-rose-500/30 text-rose-400 bg-rose-500/10",
  pub:                "border-amber-500/30 text-amber-400 bg-amber-500/10",
  brewery_taproom:    "border-amber-500/30 text-amber-400 bg-amber-500/10",
  gastropub:          "border-orange-500/30 text-orange-400 bg-orange-500/10",
  italian_restaurant: "border-red-500/30 text-red-400 bg-red-500/10",
  hotel_bar:          "border-sky-500/30 text-sky-400 bg-sky-500/10",
  restaurant_groups:  "border-pink-500/30 text-pink-400 bg-pink-500/10",
  bottle_shop:        "border-teal-500/30 text-teal-400 bg-teal-500/10",
  deli:               "border-lime-500/30 text-lime-400 bg-lime-500/10",
  farm_shop:          "border-green-500/30 text-green-400 bg-green-500/10",
  events_catering:    "border-indigo-500/30 text-indigo-400 bg-indigo-500/10",
  festival:           "border-fuchsia-500/30 text-fuchsia-400 bg-fuchsia-500/10",
  cookery_school:     "border-cyan-500/30 text-cyan-400 bg-cyan-500/10",
  corporate_gifting:  "border-blue-500/30 text-blue-400 bg-blue-500/10",
  membership_club:    "border-purple-500/30 text-purple-400 bg-purple-500/10",
  airline:            "border-slate-500/30 text-slate-400 bg-slate-500/10",
  luxury_retail:      "border-yellow-500/30 text-yellow-400 bg-yellow-500/10",
  grocery:            "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
};

const SORT_COLS: { key: SortKey; label: string; className: string }[] = [
  { key: "name",        label: "Business",  className: "w-[30%]" },
  { key: "location",    label: "Location",  className: "w-[26%]" },
  { key: "category",    label: "Category",  className: "w-[16%]" },
  { key: "assigned_to", label: "Owner",     className: "w-[12%]" },
];

function sortClients(clients: Lead[], key: SortKey, dir: SortDir): Lead[] {
  return [...clients].sort((a, b) => {
    let av = "";
    let bv = "";
    if (key === "name")        { av = a.business_name ?? ""; bv = b.business_name ?? ""; }
    if (key === "location")    { av = a.address ?? a.location_area ?? ""; bv = b.address ?? b.location_area ?? ""; }
    if (key === "category")    { av = a.venue_category ?? ""; bv = b.venue_category ?? ""; }
    if (key === "assigned_to") { av = a.assigned_to_name ?? ""; bv = b.assigned_to_name ?? ""; }
    const cmp = av.localeCompare(bv);
    return dir === "asc" ? cmp : -cmp;
  });
}

export default function ClientsPage() {
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: getClients,
  });

  const [search, setSearch]       = useState("");
  const [sortKey, setSortKey]     = useState<SortKey>("name");
  const [sortDir, setSortDir]     = useState<SortDir>("asc");
  const [editingClient, setEditingClient] = useState<Lead | null>(null);
  const debouncedSearch = useDebounce(search, 200);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const nameCount = useMemo(() => {
    const map = new Map<string, number>();
    clients.forEach((c) => {
      const k = (c.business_name ?? "").toLowerCase();
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return map;
  }, [clients]);

  const filtered = useMemo(() => {
    let list = clients;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.business_name?.toLowerCase().includes(q) ||
          c.address?.toLowerCase().includes(q) ||
          c.location_area?.toLowerCase().includes(q) ||
          c.venue_category?.toLowerCase().includes(q) ||
          c.contact_name?.toLowerCase().includes(q) ||
          c.assigned_to_name?.toLowerCase().includes(q)
      );
    }
    return sortClients(list, sortKey, sortDir);
  }, [clients, debouncedSearch, sortKey, sortDir]);

  const SortIcon = ({ k }: { k: SortKey }) =>
    k !== sortKey
      ? <ArrowUpDown className="h-3 w-3 opacity-30 ml-1 inline" />
      : sortDir === "asc"
        ? <ArrowUp className="h-3 w-3 ml-1 inline" />
        : <ArrowDown className="h-3 w-3 ml-1 inline" />;

  return (
    <div className="sp-page space-y-6">
      {/* Header */}
      <div className="sp-page-head">
        <div>
          <h1 className="sp-page-title">Clients</h1>
          <div className="sp-page-subtitle">
            {isLoading
              ? "Loading…"
              : `${clients.length} active client${clients.length !== 1 ? "s" : ""}${filtered.length !== clients.length ? ` · ${filtered.length} shown` : ""}`}
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <Card className="py-12 text-center text-muted-foreground">
          <Building2 className="mx-auto mb-3 h-8 w-8 opacity-30" />
          <p className="text-sm">No clients yet.</p>
          <p className="mt-1 text-xs">Mark a lead as converted in the Leads table.</p>
        </Card>
      ) : (
        <Card className="shadow-md">
          <div className="max-h-[70vh] overflow-auto">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow>
                  {SORT_COLS.map(({ key, label, className }) => (
                    <TableHead
                      key={key}
                      className={`${className} cursor-pointer select-none`}
                      onClick={() => handleSort(key)}
                    >
                      {label}
                      <SortIcon k={key} />
                    </TableHead>
                  ))}
                  <TableHead className="w-[10%] text-right">Stage</TableHead>
                  <TableHead className="w-8" />
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground text-sm">
                      No clients match &quot;{search}&quot;
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((client, index) => {
                    const isMultiLocation =
                      (nameCount.get((client.business_name ?? "").toLowerCase()) ?? 0) > 1;
                    const location = client.address ?? client.location_area ?? null;
                    const catColor = CATEGORY_COLORS[client.venue_category ?? ""] ?? "border-zinc-500/30 text-zinc-400 bg-zinc-500/10";

                    return (
                      <TableRow
                        key={client.id}
                        className={`transition-colors hover:bg-accent/50 cursor-pointer ${index % 2 === 1 ? "bg-muted/30" : ""}`}
                        onClick={() => setEditingClient(client)}
                      >
                        {/* Business name */}
                        <TableCell className="font-medium text-primary truncate py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{client.business_name}</span>
                            {isMultiLocation && (
                              <Badge variant="outline" className="shrink-0 text-[9px] border-amber-500/30 text-amber-400 bg-amber-500/10">
                                multi-location
                              </Badge>
                            )}
                          </div>
                          {client.contact_name && (
                            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                              <User className="h-3 w-3 shrink-0" />
                              <span className="truncate">{client.contact_name}</span>
                            </div>
                          )}
                        </TableCell>

                        {/* Location */}
                        <TableCell className="py-3">
                          {location ? (
                            <div className="flex items-start gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                              <span className={`truncate ${isMultiLocation ? "font-medium text-foreground/80" : ""}`}>
                                {location}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Category */}
                        <TableCell className="py-3">
                          {client.venue_category ? (
                            <Badge variant="outline" className={`text-[10px] capitalize ${catColor}`}>
                              {client.venue_category.replace(/_/g, " ")}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Account owner */}
                        <TableCell className="py-3 text-xs text-muted-foreground truncate">
                          {client.assigned_to_name ?? "Unassigned"}
                        </TableCell>

                        {/* Stage badge */}
                        <TableCell className="py-3 text-right">
                          {client.stage === "converted" ? (
                            <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                              converted
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] border-purple-500/30 text-purple-400 bg-purple-500/10">
                              client
                            </Badge>
                          )}
                        </TableCell>

                        {/* Website link */}
                        <TableCell className="py-3 text-right">
                          {client.website ? (
                            <a
                              href={client.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </TableCell>

                        {/* Edit button */}
                        <TableCell className="py-3 text-right">
                          <button
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            onClick={(e) => { e.stopPropagation(); setEditingClient(client); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {editingClient && (
        <ClientEditDialog
          client={editingClient}
          onClose={() => setEditingClient(null)}
        />
      )}
    </div>
  );
}
