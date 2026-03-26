"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  envVars: Record<string, boolean>;
}

export function EnvStatus({ envVars }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Environment Variables</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(envVars).map(([key, set]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <code className="text-sm">{key}</code>
              <Badge variant={set ? "default" : "destructive"}>
                {set ? "Set" : "Missing"}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
