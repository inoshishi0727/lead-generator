"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  queries: string[];
}

export function SearchQueriesList({ queries }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Queries</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {queries.map((q) => (
            <li
              key={q}
              className="rounded-md border px-3 py-2 text-sm font-mono"
            >
              {q}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
