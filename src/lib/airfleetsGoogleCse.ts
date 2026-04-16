import type { AirfleetsPayload } from "@/lib/airfleets";
import { parseSeatCounts } from "@/lib/airfleets";

const BASE = "https://www.airfleets.net";

function norm(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

export function googleCseConfigured(): boolean {
  return !!(process.env.GOOGLE_CSE_API_KEY?.trim() && process.env.GOOGLE_CSE_ID?.trim());
}

/**
 * Best-effort parse of Google’s indexed **title + snippet** for an Airfleets `ficheapp` hit (same facts Google shows in SERP).
 * Snippet wording varies by language/crawl; patterns are intentionally loose.
 */
export function parseAirfleetsGoogleCseHit(title: string, snippet: string, link: string, registration: string): AirfleetsPayload {
  const fetchedAt = new Date().toISOString();
  const reg = registration.toUpperCase().trim();
  const blob = `${title}\n${snippet}`;

  const searchUrl = `${BASE}/recherche/?key=${encodeURIComponent(reg)}`;
  let detailUrl: string | undefined;
  try {
    const u = new URL(link);
    if (u.hostname.includes("airfleets.net") && u.pathname.includes("ficheapp/plane-")) {
      detailUrl = u.href.split("#")[0];
    }
  } catch {
    /* ignore */
  }

  const out: AirfleetsPayload = {
    fetchedAt,
    searchUrl,
    detailUrl,
    airline: null,
    lineStatus: null,
  };

  const msnM = blob.match(/MSN\s*[:\s]+\s*(\d+)/i) ?? title.match(/\bMSN\s+(\d+)\b/i);
  if (msnM) out.msn = msnM[1]!.trim();

  const typeM = blob.match(/Type\s*[:\s]+\s*([^\n|·…]+)/i);
  if (typeM) out.type = norm(typeM[1]!).replace(/\s*\.?\s*$/, "") || null;

  const ffM = blob.match(/First flight[^:\n]*:\s*([^\n|·…]+)/i);
  if (ffM) out.firstFlightDate = norm(ffM[1]!).replace(/\s*\.?\s*$/, "") || null;

  const testM = blob.match(/Test registration\s*[:\s]+\s*([A-Z0-9\-]+)/i);
  if (testM) out.testRegistration = testM[1]!.trim();

  const acM = blob.match(/Aircraft\s*[:\s]*\s*(Airbus\s+[^\n|·…]+|Boeing\s+[^\n|·…]+)/i);
  if (acM) out.aircraftFamily = norm(acM[1]!).replace(/\s*\.?\s*$/, "") || null;

  const dashParts = title.split(/\s-\s/).map((s) => norm(s));
  if (dashParts.length >= 2) {
    const tail = dashParts[dashParts.length - 1]!;
    if (tail && !/^MSN\b/i.test(tail)) out.airline = tail;
  }

  const seatBlob = blob.replace(/\u00a0/g, " ");
  const cys = seatBlob.match(/\bC(\d+)\s*Y(\d+)\b/i);
  if (cys) {
    out.seatConfigRaw = `C${cys[1]} Y${cys[2]}`;
    const counts = parseSeatCounts(out.seatConfigRaw);
    out.businessSeats = counts.business;
    out.economySeats = counts.economy;
  }

  return out;
}

export function googleCsePayloadLooksUsable(p: AirfleetsPayload): boolean {
  if (p.error) return false;
  if (p.detailUrl?.includes("ficheapp/plane-")) return true;
  if (p.msn && (p.type || p.aircraftFamily)) return true;
  return false;
}

type GoogleCseJson = {
  items?: Array<{ title?: string; snippet?: string; link?: string }>;
  error?: { code?: number; message?: string };
};

/**
 * Uses [Programmable Search Engine](https://developers.google.com/custom-search/v1/overview) JSON API.
 * Query biases toward indexed `ficheapp` plane pages (what Google shows in rich snippets).
 */
export async function tryFetchAirfleetsFromGoogleCse(registration: string): Promise<AirfleetsPayload | null> {
  if (!googleCseConfigured()) return null;

  const reg = registration.toUpperCase().trim();
  if (!reg || reg.length < 4) return null;

  const key = process.env.GOOGLE_CSE_API_KEY!.trim();
  const cx = process.env.GOOGLE_CSE_ID!.trim();
  const q = `${reg} site:airfleets.net/ficheapp`;

  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", key);
  u.searchParams.set("cx", cx);
  u.searchParams.set("q", q);
  u.searchParams.set("num", "3");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 18_000);
  try {
    const res = await fetch(u.toString(), { signal: ctrl.signal, cache: "no-store" });
    const json = (await res.json()) as GoogleCseJson;
    if (!res.ok) {
      const msg = json.error?.message ?? `Google CSE HTTP ${res.status}`;
      return {
        fetchedAt: new Date().toISOString(),
        searchUrl: `${BASE}/recherche/?key=${encodeURIComponent(reg)}`,
        error: `Google CSE: ${msg}`,
      };
    }
    const items = json.items ?? [];
    for (const it of items) {
      const title = it.title ?? "";
      const snippet = it.snippet ?? "";
      const link = it.link ?? "";
      if (!link.includes("airfleets.net")) continue;
      const parsed = parseAirfleetsGoogleCseHit(title, snippet, link, reg);
      if (googleCsePayloadLooksUsable(parsed)) return parsed;
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      fetchedAt: new Date().toISOString(),
      searchUrl: `${BASE}/recherche/?key=${encodeURIComponent(reg)}`,
      error: `Google CSE: ${msg}`,
    };
  } finally {
    clearTimeout(t);
  }
}
