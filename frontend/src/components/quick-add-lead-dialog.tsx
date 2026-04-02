"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateLead } from "@/hooks/use-leads";

interface Props {
  open: boolean;
  onClose: () => void;
}

const INSTAGRAM_RE = /instagram\.com\/([a-zA-Z0-9._]+)/;

function parseUrl(raw: string): {
  website: string | null;
  instagram_handle: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { website: null, instagram_handle: null };

  const igMatch = trimmed.match(INSTAGRAM_RE);
  if (igMatch) {
    return { website: null, instagram_handle: igMatch[1] };
  }

  const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  return { website: url, instagram_handle: null };
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function QuickAddLeadDialog({ open, onClose }: Props) {
  const [url, setUrl] = useState("");
  const createMutation = useCreateLead();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      setUrl("");
      createMutation.reset();
    }
  }, [open]);

  if (!open) return null;

  function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) return;

    const parsed = parseUrl(trimmed);

    // Use domain or Instagram handle as a placeholder business name
    const placeholder =
      parsed.instagram_handle ||
      extractDomain(trimmed) ||
      trimmed.slice(0, 60);

    createMutation.mutate(
      { business_name: placeholder, ...parsed },
      { onSuccess: () => onClose() }
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold mb-1">Quick Add Lead</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Paste a link and it&apos;ll be scraped &amp; enriched on the next run.
        </p>

        <div className="space-y-4">
          <div>
            <Input
              placeholder="https://... or instagram.com/handle"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              autoFocus
            />
          </div>

          {createMutation.isError && (
            <p className="text-sm text-red-500">
              Failed to add lead. Please try again.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!url.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {createMutation.isPending ? "Adding..." : "Add Lead"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
