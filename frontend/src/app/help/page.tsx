"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Sparkles,
  CheckCircle2,
  Mail,
  BarChart3,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

const FAQ_SECTIONS: { title: string; icon: React.ElementType; items: FAQItem[] }[] = [
  {
    title: "Getting Started",
    icon: Sparkles,
    items: [
      {
        question: "What is this tool?",
        answer: (
          <div className="space-y-3">
            <p>
              Asterley Bros Leadgen finds venues that would be a great fit for
              your craft spirits — cocktail bars, wine bars, restaurants,
              hotels, and bottle shops. It scans Google Maps and Instagram,
              analyses each venue&apos;s website, writes personalised outreach
              emails, and sends them on your behalf.
            </p>
            <p>
              The key thing: <strong>you approve every message</strong> before it
              goes out. The AI does the research and writing, you make the final
              call.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              {["Find", "Enrich", "Score", "Draft", "Approve", "Send", "Follow Up"].map(
                (s, i) => (
                  <span key={s} className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                      {s}
                    </span>
                    {i < 6 && <ChevronRight className="h-3 w-3" />}
                  </span>
                )
              )}
            </div>
          </div>
        ),
      },
      {
        question: "How do I find new leads?",
        answer: (
          <p>
            Head to the Dashboard and look for the &quot;Start Scrape&quot;
            section. Pick which types of venues you want to target (cocktail
            bars, wine bars, etc.), set how many leads you&apos;re after, and hit
            Start. The system searches Google Maps and Instagram, visits each
            venue&apos;s website, and scores them automatically. You can watch
            the progress in real time.
          </p>
        ),
      },
      {
        question: "How long does a scrape take?",
        answer: (
          <p>
            Usually 10–20 minutes depending on how many leads you&apos;re
            targeting. The system visits each venue&apos;s website to gather info,
            which takes a bit of time. You&apos;ll see a live progress bar so you
            know exactly where things are at.
          </p>
        ),
      },
    ],
  },
  {
    title: "Scoring & Leads",
    icon: Search,
    items: [
      {
        question: "How does scoring work?",
        answer: (
          <div className="space-y-3">
            <p>
              Each venue gets scored out of 100 across 11 things we check. A
              venue needs <strong>40+ points</strong> to qualify for outreach. The
              biggest factors are:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Cocktail focus</strong> (15 pts) — does the venue mention
                cocktails, spirits, or vermouth?
              </li>
              <li>
                <strong>Menu fit</strong> (15 pts) — does their drinks menu align
                with Asterley products?
              </li>
              <li>
                <strong>Has email</strong> (12 pts) — can we actually reach them?
              </li>
              <li>
                <strong>Venue type</strong> (12 pts) — cocktail bars, wine bars,
                hotel bars, and bottle shops score higher
              </li>
              <li>
                <strong>Independent venue</strong> (10 pts) — chains are filtered
                out
              </li>
            </ul>
            <p>
              Click any lead to see exactly which rules it passed and failed.
            </p>
          </div>
        ),
      },
      {
        question: "What does 'Menu Fit' mean?",
        answer: (
          <div className="space-y-2">
            <p>
              Menu Fit is how well a venue&apos;s drinks programme aligns with
              Asterley products. The AI reads their menu and website to figure
              this out.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Strong</strong> — cocktail-forward venue, already stocks
                similar spirits, great fit
              </li>
              <li>
                <strong>Moderate</strong> — some alignment, worth reaching out
              </li>
              <li>
                <strong>Weak</strong> — not a great match right now
              </li>
            </ul>
          </div>
        ),
      },
      {
        question: "What are venue categories?",
        answer: (
          <div className="space-y-2">
            <p>
              Every venue gets classified into a category based on what the AI
              finds on their website. The most common ones:
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                "Cocktail Bar",
                "Wine Bar",
                "Hotel Bar",
                "Italian Restaurant",
                "Gastropub",
                "Bottle Shop",
                "Deli / Farm Shop",
                "Restaurant Groups",
                "Events & Catering",
              ].map((cat) => (
                <span
                  key={cat}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        ),
      },
    ],
  },
  {
    title: "Outreach & Emails",
    icon: Mail,
    items: [
      {
        question: "How are emails written?",
        answer: (
          <p>
            The AI reads each venue&apos;s website — their menu, about page,
            vibe — and writes a personalised email that mentions specific things
            about their business and which Asterley products would work for them.
            Every email is different. You always review and approve before
            anything sends.
          </p>
        ),
      },
      {
        question: "Can I edit emails before sending?",
        answer: (
          <p>
            Absolutely. Click any draft to edit the subject line or body text
            directly. You can also hit &quot;Regenerate&quot; to get a completely
            fresh version. If something&apos;s close but not quite right, just
            tweak it and approve.
          </p>
        ),
      },
      {
        question: "When should I send?",
        answer: (
          <p>
            Tuesday to Thursday, between 10am and 1pm tends to get the best open
            rates. The app will give you a gentle nudge if you try to send
            outside this window — but you can always override it if you want to.
          </p>
        ),
      },
      {
        question: "What are follow-ups?",
        answer: (
          <div className="space-y-2">
            <p>
              If a venue doesn&apos;t reply to your first email, the system can
              automatically write follow-up messages:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Day 5</strong> — a second email that adds value,
                mentions a different product
              </li>
              <li>
                <strong>Day 12</strong> — a third email with a seasonal angle or
                social proof
              </li>
            </ul>
            <p>
              You still review and approve every follow-up before it sends.
              Nothing goes out automatically.
            </p>
          </div>
        ),
      },
      {
        question: "Are there sending limits?",
        answer: (
          <p>
            Yes — to protect your sender reputation, the system caps at 50
            emails per day and 20 Instagram DMs per day. These limits are
            enforced automatically so you don&apos;t need to worry about it.
          </p>
        ),
      },
    ],
  },
  {
    title: "Pipeline & Tracking",
    icon: BarChart3,
    items: [
      {
        question: "What do the stages mean?",
        answer: (
          <div className="space-y-2">
            <p>
              Every lead moves through a pipeline. Here&apos;s what each stage
              means:
            </p>
            <div className="grid gap-2 pt-1">
              {[
                ["Scraped", "Just discovered from Google Maps or Instagram"],
                ["Needs Email", "Found but no email yet — we're still looking"],
                ["Enriched", "Website visited and analysed by AI"],
                ["Scored", "Points assigned, ready for review"],
                ["Draft Generated", "AI has written a personalised email"],
                ["Approved", "You've approved the email"],
                ["Sent", "Email delivered"],
                ["Follow-up 1", "First follow-up sent (Day 5)"],
                ["Follow-up 2", "Second follow-up sent (Day 12)"],
                ["Responded", "They replied!"],
                ["Converted", "Became a stockist or booked a tasting"],
                ["Declined", "Not interested, or you decided not to pursue"],
              ].map(([stage, desc]) => (
                <div key={stage} className="flex gap-3 text-sm">
                  <span className="w-28 shrink-0 font-medium">{stage}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        question: "How do I track responses?",
        answer: (
          <p>
            When a venue replies, go to their lead in the Leads page and update
            their status to &quot;Responded.&quot; If they want a tasting or
            place an order, mark them &quot;Converted.&quot; The Analytics page
            tracks all of this automatically so you can see your response and
            conversion rates.
          </p>
        ),
      },
    ],
  },
];

function Accordion({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left text-sm font-medium hover:text-foreground transition-colors"
      >
        {item.question}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="pb-4 text-sm leading-relaxed text-muted-foreground">
          {item.answer}
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen">
      {/* Only show standalone header when not logged in (logged-in users see the navbar) */}
      {!isLoggedIn && (
        <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Asterley Bros
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-xs">
                Sign In
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-3xl px-4 py-12">
        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex rounded-2xl bg-primary/10 p-3">
            <HelpCircle className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            How does it work?
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Everything you need to know about using the Asterley Bros lead
            generation tool.
          </p>
        </div>

        {/* FAQ Sections */}
        <div className="mt-12 space-y-8">
          {FAQ_SECTIONS.map((section) => {
            const SectionIcon = section.icon;
            return (
              <Card key={section.title}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <SectionIcon className="h-4 w-4 text-primary" />
                    <h2 className="text-base font-semibold">{section.title}</h2>
                  </div>
                  <div>
                    {section.items.map((item) => (
                      <Accordion key={item.question} item={item} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* CTA — only show sign-in prompt when not logged in */}
        {!isLoggedIn && (
          <div className="mt-12 text-center space-y-4 pb-8">
            <p className="text-sm text-muted-foreground">
              Ready to get started?
            </p>
            <Link href="/login">
              <Button>
                Sign in to your dashboard
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
