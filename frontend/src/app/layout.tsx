import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { QueryProvider } from "@/components/query-provider";
import { JobsProvider } from "@/components/jobs-provider";
import { ActiveJobsBar } from "@/components/active-jobs-bar";
import { LiveUpdates } from "@/components/live-updates";
import { Toaster } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
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
      className={`dark ${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <QueryProvider>
          <AuthShell>
            <JobsProvider>
              <LiveUpdates />
              <ActiveJobsBar />
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
                {children}
              </main>
            </JobsProvider>
          </AuthShell>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
