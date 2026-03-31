"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/tour-provider";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export function AppTour() {
  const { active, step, steps, currentStep, next, prev, end } = useTour();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Find and track the target element
  useEffect(() => {
    if (!active || !currentStep) {
      setRect(null);
      return;
    }

    let scrolled = false;

    function findTarget() {
      const el = document.querySelector(
        `[data-tour="${currentStep!.target}"]`
      );
      if (el) {
        // Auto-scroll the target into view on first find
        if (!scrolled) {
          scrolled = true;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        const r = el.getBoundingClientRect();
        setRect(r);
      } else {
        setRect(null);
      }
      rafRef.current = requestAnimationFrame(findTarget);
    }

    // Delay to let page render after navigation, then scroll + spotlight
    const timeout = setTimeout(() => {
      findTarget();
    }, 400);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, currentStep, step]);

  // Position tooltip relative to target
  useEffect(() => {
    if (!rect || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const pad = 16;

    // Prefer placing below the target
    let top = rect.bottom + pad;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

    // If it goes off the bottom, place above
    if (top + tooltipRect.height > window.innerHeight - pad) {
      top = rect.top - tooltipRect.height - pad;
    }

    // Keep within horizontal bounds
    left = Math.max(pad, Math.min(left, window.innerWidth - tooltipRect.width - pad));

    // Keep within vertical bounds
    top = Math.max(pad, top);

    setTooltipStyle({ top, left });
  }, [rect]);

  if (!active || !currentStep) return null;

  const padding = 8;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop with spotlight cutout */}
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - padding}
                y={rect.top - padding}
                width={rect.width + padding * 2}
                height={rect.height + padding * 2}
                rx={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#tour-mask)"
        />
        {/* Spotlight border */}
        {rect && (
          <rect
            x={rect.left - padding}
            y={rect.top - padding}
            width={rect.width + padding * 2}
            height={rect.height + padding * 2}
            rx={12}
            fill="none"
            stroke="oklch(0.70 0.12 260)"
            strokeWidth={2}
          />
        )}
      </svg>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute z-10 w-80 rounded-xl border border-border/60 bg-card p-5 shadow-2xl"
        style={tooltipStyle}
      >
        <button
          onClick={end}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-sm font-semibold">{currentStep.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {currentStep.message}
        </p>

        <div className="mt-4 flex items-center justify-between">
          {/* Step indicator */}
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === step ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={prev}>
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {step < steps.length - 1 ? (
                <>
                  Next
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </>
              ) : (
                "Done"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
