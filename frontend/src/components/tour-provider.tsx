"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

export interface TourStep {
  target: string; // data-tour attribute value
  page: string; // route path
  title: string;
  message: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "metrics",
    page: "/",
    title: "Your numbers at a glance",
    message:
      "These cards show how your outreach is going — total leads found, emails ready, drafts waiting for review, and messages sent.",
  },
  {
    target: "scrape-controls",
    page: "/",
    title: "Kick off a new search",
    message:
      "This is where you start. Pick your venue types, set how many leads you want, and hit Start Scrape. The system does the rest.",
  },
  {
    target: "leads-filters",
    page: "/leads",
    title: "Find the right leads",
    message:
      "Filter by source, stage, or just search by name. Toggle 'Email only' to see leads that are ready for outreach.",
  },
  {
    target: "leads-table",
    page: "/leads",
    title: "Your lead list",
    message:
      "Every venue lands here. Click any row to see the full picture — score breakdown, menu fit, contact info, and all messages for that lead.",
  },
  {
    target: "outreach-actions",
    page: "/outreach",
    title: "Review and approve",
    message:
      "AI-drafted emails show up here. Read them, tweak the subject or body, then approve the ones you're happy with. Nothing sends without your say-so.",
  },
  {
    target: "outreach-messages",
    page: "/outreach",
    title: "Your email drafts",
    message:
      "Each card is a personalised email. You can edit, regenerate, approve, or reject any of them before sending.",
  },
  {
    target: "funnel-chart",
    page: "/analytics",
    title: "Track your pipeline",
    message:
      "See how leads move from discovery to conversion. This is your bird's-eye view of what's working and where to focus next.",
  },
  {
    target: "help-button",
    page: "/analytics",
    title: "Need help?",
    message:
      "Tap this icon any time to open the FAQ. It covers scoring, emails, follow-ups, stages, and more.",
  },
];

interface TourContextValue {
  active: boolean;
  step: number;
  steps: TourStep[];
  currentStep: TourStep | null;
  start: () => void;
  next: () => void;
  prev: () => void;
  end: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

const STORAGE_KEY = "asterley_tour_completed";

export function TourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  const currentStep = active ? TOUR_STEPS[step] ?? null : null;

  // Navigate to the correct page when step changes
  useEffect(() => {
    if (!active || !currentStep) return;
    if (pathname !== currentStep.page) {
      router.push(currentStep.page);
    }
  }, [active, step, currentStep, pathname, router]);

  const start = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      // Tour complete
      setActive(false);
      setStep(0);
      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {}
    }
  }, [step]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const end = useCallback(() => {
    setActive(false);
    setStep(0);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
  }, []);

  return (
    <TourContext value={{ active, step, steps: TOUR_STEPS, currentStep, start, next, prev, end }}>
      {children}
    </TourContext>
  );
}
