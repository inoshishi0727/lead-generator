import type { Metadata } from "next";

export const metadata: Metadata = { title: "Logs — Asterley Bros" };

export default function LogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
