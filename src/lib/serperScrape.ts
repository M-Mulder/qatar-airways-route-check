/**
 * Serper Scrape API — shared by Airfleets and Flightradar24 fetches (same key as Airfleets cron).
 * @see https://serper.dev
 */

const SCRAPE_URL = "https://scrape.serper.dev";

function norm(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

export function serperConfigured(): boolean {
  return !!process.env.SERPER_API_KEY?.trim();
}

export type SerperScrapeJson = {
  text?: string;
  metadata?: { title?: string; description?: string };
  credits?: number;
  error?: string;
};

/**
 * Renders `targetUrl` and returns plain text / markdown-style body (same endpoint as Airfleets).
 */
export async function scrapeUrlViaSerper(targetUrl: string): Promise<SerperScrapeJson> {
  const key = process.env.SERPER_API_KEY!.trim();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(SCRAPE_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: targetUrl }),
      cache: "no-store",
    });
    const raw = await res.text();
    let json: SerperScrapeJson;
    try {
      json = JSON.parse(raw) as SerperScrapeJson;
    } catch {
      throw new Error(`Scrape API returned non-JSON (HTTP ${res.status}).`);
    }
    if (!res.ok) {
      throw new Error(
        json.error || `Scrape API HTTP ${res.status}: ${norm(raw).slice(0, 200)}`,
      );
    }
    if (json.error) throw new Error(`Scrape API: ${json.error}`);
    return json;
  } finally {
    clearTimeout(t);
  }
}
