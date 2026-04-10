"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditReflectionDialog } from "@/components/edit-reflection-dialog";
import { useUnreflectedCount } from "@/hooks/use-edit-reflections";

export function EditReflectionBanner() {
  const { data: count } = useUnreflectedCount();
  const [dismissed, setDismissed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (dismissed || !count || count === 0) return null;

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4" />
          <span>
            You edited {count} draft{count !== 1 ? "s" : ""} this week. Take 2 minutes to tag why?
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
            onClick={() => setDismissed(true)}
          >
            <X className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            className="h-7"
            onClick={() => setDialogOpen(true)}
          >
            Review Edits
          </Button>
        </div>
      </div>

      {dialogOpen && (
        <EditReflectionDialog onClose={() => setDialogOpen(false)} />
      )}
    </>
  );
}
