"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/tour-provider";
import { useAuth } from "@/lib/auth-context";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Search,
  Sparkles,
  CheckCircle2,
  Send,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

const STORAGE_KEY = "asterley_onboarding_seen";

/* ------------------------------------------------------------------ */
/*  Intro steps (slides)                                               */
/* ------------------------------------------------------------------ */

const INTRO_STEPS = [
  {
    icon: Sparkles,
    accent: "text-purple-400",
    bg: "bg-purple-500/10",
    title: "Welcome to Asterley Bros",
    body: "This tool finds venues that are a great fit for your spirits, writes personalised emails to each one, and sends them — with your approval at every step.",
    visual: (
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        {["Find", "Enrich", "Score", "Draft", "Approve", "Send"].map(
          (s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-foreground">
                {s}
              </span>
              {i < 5 && <ChevronRight className="h-3 w-3" />}
            </span>
          )
        )}
      </div>
    ),
  },
  {
    icon: Search,
    accent: "text-blue-400",
    bg: "bg-blue-500/10",
    title: "We find the leads",
    body: "Every week, we scan Google Maps and Instagram for cocktail bars, wine bars, restaurants, hotels, and bottle shops. Each venue gets scored on how good a fit they are — things like whether they serve cocktails, have a website, and are an independent venue.",
    visual: (
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { label: "Cocktail Bars", score: "85" },
          { label: "Wine Bars", score: "72" },
          { label: "Hotel Bars", score: "68" },
        ].map((v) => (
          <div
            key={v.label}
            className="rounded-lg border border-border/40 bg-muted/30 p-3"
          >
            <p className="font-medium text-foreground">{v.label}</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-primary">
              {v.score}
            </p>
            <p className="text-muted-foreground">score</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: CheckCircle2,
    accent: "text-emerald-400",
    bg: "bg-emerald-500/10",
    title: "AI writes, you approve",
    body: "Our AI reads each venue's website and writes a personalised email mentioning their specific menu, vibe, and which Asterley products would work for them. You review every message before it goes out — edit it, regenerate it, or approve it as-is.",
    visual: (
      <div className="rounded-lg border border-border/40 bg-muted/30 p-4 text-sm">
        <p className="font-medium text-foreground">
          &quot;Hi Sarah — loved your Negroni menu at The Copper...&quot;
        </p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            Approve
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Edit
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Regenerate
          </span>
        </div>
      </div>
    ),
  },
  {
    icon: Send,
    accent: "text-sky-400",
    bg: "bg-sky-500/10",
    title: "You're in control",
    body: "Send emails with one click, track who opens them, and follow up automatically at Day 5 and Day 12. Nothing ever leaves your outbox without your say-so.",
    visual: null,
  },
];

/* ------------------------------------------------------------------ */
/*  FAQ items (shown inline after intro steps)                         */
/* ------------------------------------------------------------------ */

const FAQ_ITEMS = [
  {
    q: "How do I find new leads?",
    a: "Head to the Dashboard and hit \"Start Scrape.\" Pick your venue types, set how many leads you want, and the system searches Google Maps and Instagram automatically.",
  },
  {
    q: "How does scoring work?",
    a: "Each venue is scored out of 100 across 11 criteria — cocktail focus, menu fit, email availability, venue type, independence, and more. Venues need 40+ points to qualify. Click any lead to see the full breakdown.",
  },
  {
    q: "Can I edit emails before sending?",
    a: "Yes — click any draft to edit the subject or body. You can also regenerate it for a completely fresh version.",
  },
  {
    q: "When should I send?",
    a: "Tuesday to Thursday, 10am–1pm gets the best open rates. The app nudges you if you try outside that window, but you can always override.",
  },
  {
    q: "What are follow-ups?",
    a: "If a venue doesn't reply, the system writes follow-up emails at Day 5 and Day 12. You still approve each one before it sends.",
  },
  {
    q: "What do the pipeline stages mean?",
    a: "Scraped → Enriched → Scored → Draft Generated → Approved → Sent → Follow-up 1 → Follow-up 2 → Responded → Converted or Declined. Each lead moves through these as it progresses.",
  },
];

/* ------------------------------------------------------------------ */
/*  Phases: "intro" (slides) → "faq" (inline FAQ) → "done" (finish)   */
/* ------------------------------------------------------------------ */

type Phase = "intro" | "faq" | "done";

function FAQAccordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-3 text-left text-sm font-medium hover:text-foreground transition-colors"
      >
        {q}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <p className="pb-3 text-sm leading-relaxed text-muted-foreground">
          {a}
        </p>
      )}
    </div>
  );
}

export function GettingStarted() {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");
  const [introStep, setIntroStep] = useState(0);
  const { start: startTour } = useTour();
  const { user } = useAuth();
  const router = useRouter();

  // Firestore is the source of truth
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function check() {
      try {
        const userDoc = await getDoc(doc(db, "users", user!.uid));
        const data = userDoc.exists() ? userDoc.data() : null;

        if (cancelled) return;

        if (data?.onboarded === true) {
          return;
        }

        setVisible(true);
      } catch {
        if (!cancelled && !localStorage.getItem(STORAGE_KEY)) {
          setVisible(true);
        }
      }
    }

    check();
    return () => { cancelled = true; };
  }, [user]);

  if (!visible) return null;

  function markComplete() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
    if (user) {
      updateDoc(doc(db, "users", user.uid), { onboarded: true }).catch(() => {});
    }
  }

  function handleSkip() {
    markComplete();
    router.push("/");
  }

  function handleTakeTour() {
    markComplete();
    startTour();
  }

  function handleFinish() {
    markComplete();
    router.push("/");
  }

  // Total step count for the dots indicator
  // intro slides + faq screen + done screen
  const totalSteps = INTRO_STEPS.length + 2;
  const currentDot =
    phase === "intro"
      ? introStep
      : phase === "faq"
        ? INTRO_STEPS.length
        : INTRO_STEPS.length + 1;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border/40 bg-card p-8 shadow-2xl">
        {/* Skip */}
        <div className="flex justify-end">
          <button
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
        </div>

        {/* ---- INTRO PHASE ---- */}
        {phase === "intro" && (() => {
          const current = INTRO_STEPS[introStep];
          const Icon = current.icon;
          return (
            <>
              <div className="mt-2 flex justify-center">
                <div className={`rounded-2xl ${current.bg} p-4`}>
                  <Icon className={`h-8 w-8 ${current.accent}`} />
                </div>
              </div>
              <h2 className="mt-6 text-center text-xl font-bold tracking-tight">
                {current.title}
              </h2>
              <p className="mt-3 text-center text-sm leading-relaxed text-muted-foreground">
                {current.body}
              </p>
              {current.visual && <div className="mt-6">{current.visual}</div>}
            </>
          );
        })()}

        {/* ---- FAQ PHASE ---- */}
        {phase === "faq" && (
          <>
            <div className="mt-2 flex justify-center">
              <div className="rounded-2xl bg-amber-500/10 p-4">
                <HelpCircle className="h-8 w-8 text-amber-400" />
              </div>
            </div>
            <h2 className="mt-6 text-center text-xl font-bold tracking-tight">
              Frequently asked questions
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              A quick rundown of the things you&apos;ll want to know.
            </p>
            <div className="mt-5 max-h-64 overflow-y-auto rounded-lg border border-border/30 bg-muted/20 px-4">
              {FAQ_ITEMS.map((item) => (
                <FAQAccordion key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </>
        )}

        {/* ---- DONE PHASE ---- */}
        {phase === "done" && (
          <>
            <div className="mt-2 flex justify-center">
              <div className="rounded-2xl bg-emerald-500/10 p-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
            </div>
            <h2 className="mt-6 text-center text-xl font-bold tracking-tight">
              You&apos;re all set!
            </h2>
            <p className="mt-3 text-center text-sm leading-relaxed text-muted-foreground">
              You&apos;ve got the basics down. Take a guided tour of the
              dashboard to see everything in action, or jump straight in.
            </p>
          </>
        )}

        {/* Step indicator */}
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === currentDot
                  ? "w-6 bg-primary"
                  : "w-2 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-between">
          {/* Back button */}
          {(phase !== "intro" || introStep > 0) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (phase === "done") setPhase("faq");
                else if (phase === "faq") {
                  setPhase("intro");
                  setIntroStep(INTRO_STEPS.length - 1);
                } else if (introStep > 0) {
                  setIntroStep((s) => s - 1);
                }
              }}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </Button>
          ) : (
            <div />
          )}

          {/* Forward button */}
          {phase === "intro" ? (
            <Button
              size="sm"
              onClick={() => {
                if (introStep < INTRO_STEPS.length - 1) {
                  setIntroStep((s) => s + 1);
                } else {
                  setPhase("faq");
                }
              }}
            >
              Next
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          ) : phase === "faq" ? (
            <Button size="sm" onClick={() => setPhase("done")}>
              Next
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleTakeTour}>
                Take a tour
              </Button>
              <Button size="sm" onClick={handleFinish}>
                Go to Dashboard
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
