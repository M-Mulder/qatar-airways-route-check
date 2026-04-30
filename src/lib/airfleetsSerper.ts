import type { AirfleetsPayload } from "@/lib/airfleets";
import { formatAirfleetsErrorForStorage, parseSeatCounts } from "@/lib/airfleets";
import { scrapeUrlViaSerper, serperConfigured } from "@/lib/serperScrape";

const BASE = "https://www.airfleets.net";

function norm(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

export { serperConfigured };

/**
 * Airfleets `ficheapp` path segment after `plane-`, e.g. Airbus A350 + MSN 33 → `a350-33`.
 * Boeing uses the **base** model only in the slug (e.g. `plane-b777-36010.htm`), not `777-300ER`.
 */
export function planeSlugFromAircraft(aircraft: string): string | null {
  const t = norm(aircraft);
  const airbus = t.match(/\bAirbus\s+(A\d{2,4}[A-Za-z0-9-]*)\b/i);
  if (airbus) return airbus[1]!.toLowerCase();
  const boeing = t.match(/\bBoeing\s+(\d{3})\b/i);
  if (boeing) return `b${boeing[1]!.toLowerCase()}`;
  const emb = t.match(/\bEmbraer\s+([Ee]\d+[-\w]*)\b/i);
  if (emb) return emb[1]!.toLowerCase();
  const bd = t.match(/\b(Bombardier|De Havilland Canada)\s+([A-Za-z0-9-]+)\b/i);
  if (bd) return bd[2]!.toLowerCase().replace(/\s+/g, "");
  return null;
}

export type SerperSearchRow = {
  aircraftFamily: string;
  msn: string;
  airline: string | null;
  lineStatus: string | null;
};

/**
 * Parse Serper `text` from Airfleets search (`recherche/?key=`). Rows use multiple spaces between columns.
 */
export function parseAirfleetsSearchSerperText(text: string, registration: string): SerperSearchRow | null {
  const reg = registration.toUpperCase().trim();
  if (!reg) return null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.includes(reg)) continue;
    const cols = line
      .split(/\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length < 5) continue;
    const ri = cols.findIndex((c) => c.toUpperCase() === reg);
    if (ri !== 1) continue;
    const aircraftFamily = cols[0]!;
    const msn = cols[2]!;
    const airline = cols[3] ?? null;
    const lineStatus = cols[4] ?? null;
    if (!/^\d+$/.test(msn)) continue;
    if (!aircraftFamily || aircraftFamily.length < 3) continue;
    return {
      aircraftFamily,
      msn,
      airline: airline ? norm(airline) : null,
      lineStatus: lineStatus ? norm(lineStatus) : null,
    };
  }
  return null;
}

/**
 * Parse Serper `text` from an Airfleets plane page (markdown-ish plain text).
 */
export function parseAirfleetsPlanePlainText(
  text: string,
  detailUrl: string,
): Omit<AirfleetsPayload, "fetchedAt" | "searchUrl" | "error"> {
  const out: Omit<AirfleetsPayload, "fetchedAt" | "searchUrl" | "error"> = { detailUrl };

  const parenMsn = text.match(/\(\s*([^)]+?)\s*-\s*MSN\s+(\d+)\s*\)/i);
  if (parenMsn) {
    const fam = norm(parenMsn[1]!);
    if (fam) out.aircraftFamily = fam;
    out.msn = parenMsn[2]!.trim();
  }

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const m = line.match(/^(.+?)\s{2,}(\S.*)$/);
    if (!m) continue;
    const label = norm(m[1]!).toLowerCase();
    const value = norm(m[2]!);
    if (!value) continue;
    if (label.startsWith("serial number")) out.msn = value;
    else if (label === "type") out.type = value;
    else if (label.startsWith("first flight")) out.firstFlightDate = value;
    else if (label.startsWith("test registration")) out.testRegistration = value;
    else if (label.startsWith("plane age")) out.planeAge = value;
    else if (label.includes("seat") && label.includes("config")) {
      out.seatConfigRaw = value;
      const counts = parseSeatCounts(value);
      out.businessSeats = counts.business;
      out.economySeats = counts.economy;
    }     else if (label.startsWith("hex code")) out.hexCode = value.replace(/\s+/g, "");
    else if (label.startsWith("engines")) out.engines = value;
  }

  return out;
}

function planeTextLooksLikeRegistration(text: string, reg: string): boolean {
  const u = reg.toUpperCase();
  return new RegExp(`\\b${u.replace(/-/g, "\\-")}\\b`).test(text);
}

/**
 * Fetch Airfleets search + plane pages via [Serper scrape](https://serper.dev) (renders target URL and returns text).
 */
export async function fetchAirfleetsWithSerper(registration: string): Promise<AirfleetsPayload> {
  const fetchedAt = new Date().toISOString();
  const reg = registration.toUpperCase().trim();
  if (!reg || reg.length < 4) {
    return { fetchedAt, error: "Missing or too-short registration for aircraft lookup." };
  }
  if (!serperConfigured()) {
    return { fetchedAt, error: "SERPER_API_KEY is not set." };
  }

  const searchUrl = `${BASE}/recherche/?key=${encodeURIComponent(reg)}`;

  try {
    const searchJson = await scrapeUrlViaSerper(searchUrl);
    const searchText = searchJson.text ?? "";
    const row = parseAirfleetsSearchSerperText(searchText, reg);
    if (!row) {
      return {
        fetchedAt,
        searchUrl,
        error: "No matching aircraft row in search text (layout or blocking).",
      };
    }

    const slug = planeSlugFromAircraft(row.aircraftFamily);
    if (!slug) {
      return {
        fetchedAt,
        searchUrl,
        error: `Could not map aircraft “${row.aircraftFamily}” to a plane page URL slug.`,
      };
    }

    const detailUrl = `${BASE}/ficheapp/plane-${slug}-${row.msn}.htm`;
    const planeJson = await scrapeUrlViaSerper(detailUrl);
    const planeText = planeJson.text ?? "";
    if (!planeTextLooksLikeRegistration(planeText, reg)) {
      return {
        fetchedAt,
        searchUrl,
        detailUrl,
        airline: row.airline,
        lineStatus: row.lineStatus,
        error: `Aircraft detail text does not mention ${reg} (wrong slug or blocked page).`,
      };
    }

    const parsed = parseAirfleetsPlanePlainText(planeText, detailUrl);
    return {
      fetchedAt,
      searchUrl,
      detailUrl,
      airline: row.airline,
      lineStatus: row.lineStatus,
      ...parsed,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { fetchedAt, searchUrl, error: formatAirfleetsErrorForStorage(msg) };
  }
}
