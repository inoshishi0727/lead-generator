import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { QueryProvider } from "@/components/query-provider";
import { JobsProvider } from "@/components/jobs-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ActiveJobsBar } from "@/components/active-jobs-bar";
import { LiveUpdates } from "@/components/live-updates";
import { Toaster } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import "./globals.css";
import "@/styles/stockpile.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Asterley Bros — Lead Generation",
  description: "AI-powered lead generation dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${mono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full" suppressHydrationWarning>
        <QueryProvider>
          <ThemeProvider>
          <AuthShell>
            <JobsProvider>
              <LiveUpdates />
              <ActiveJobsBar />
              {children}
            </JobsProvider>
          </AuthShell>
          </ThemeProvider>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
