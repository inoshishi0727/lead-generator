/** VPS-only API client — used exclusively for scraping, enrichment, and search queries. */
const VPS_BASE = process.env.NEXT_PUBLIC_VPS_URL ?? "";
export const hasVps = !!VPS_BASE;

export function getVpsWsUrl(): string {
  if (!VPS_BASE) return "";
  // Skip WebSocket on HTTPS pages connecting to non-SSL VPS (mixed content blocked)
  if (typeof window !== "undefined" && window.location.protocol === "https:" && VPS_BASE.startsWith("http://")) {
    return "";
  }
  return VPS_BASE.replace(/^http/, "ws") + "/ws";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${VPS_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text);
  }
  return res.json() as Promise<T>;
}

export const vpsApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
};
