import * as cheerio from "cheerio";
import { format, isValid, parse } from "date-fns";

export type Fr24ParsedRow = {
  dateIso: string;
  fromIata: string | null;
  toIata: string | null;
  registration: string | null;
  aircraftCellText: string;
};

const AIRPORT_HREF = /\/data\/airports\/([a-z]{3})/i;
const AIRCRAFT_HREF = /\/data\/aircraft\/([a-z0-9-]+)/i;
const DATE_CELL = /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/;
/** Leading calendar date on a line (Serper returns plain text, not always HTML). */
const DATE_PREFIX = /^(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b\s*(.*)$/i;

function airportFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(AIRPORT_HREF);
  return m ? m[1].toUpperCase() : null;
}

function regFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = href.match(AIRCRAFT_HREF);
  if (!m) return null;
  const slug = m[1].toUpperCase();
  if (slug.startsWith("A7-")) return slug;
  return `A7-${slug.replace(/^A7-?/i, "")}`;
}

function parseFr24Date(cell: string): string | null {
  const t = cell.trim();
  if (!DATE_CELL.test(t)) return null;
  const d = parse(t, "d MMM yyyy", new Date());
  if (!isValid(d)) return null;
  return format(d, "yyyy-MM-dd");
}

function extractLeadingDateIso(line: string): { iso: string; rest: string } | null {
  const m = line.match(DATE_PREFIX);
  if (!m) return null;
  const iso = parseFr24Date(m[1]!.trim());
  if (!iso) return null;
  return { iso, rest: (m[2] ?? "").trim() };
}

/** All-caps 3-letter tokens that are not IATA airport codes when scraped from mixed pages. */
const SKIP_IATA_LIKE = new Set([
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "JAN",
  "FEB",
  "MAR",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
  "UTC",
  "GMT",
  "AND",
  "THE",
]);

function normalizeRegFromText(s: string): string {
  const u = s.toUpperCase().trim();
  if (u.startsWith("A7-")) return u;
  return `A7-${u.replace(/^A7-?/i, "")}`;
}

/**
 * Parse Serper-style plain text when `#tbl-datatable` HTML is not present (same rows as HTML parser).
 */
export function parseFr24FlightHistoryPlainText(text: string): Fr24ParsedRow[] {
  const out: Fr24ParsedRow[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const inline = extractLeadingDateIso(line);
    let dateIso: string | null = null;
    const tailParts: string[] = [];

    if (inline) {
      dateIso = inline.iso;
      if (inline.rest) tailParts.push(inline.rest);
    } else if (DATE_CELL.test(line)) {
      dateIso = parseFr24Date(line);
    } else {
      i += 1;
      continue;
    }

    if (!dateIso) {
      i += 1;
      continue;
    }

    i += 1;
    while (i < lines.length) {
      const next = lines[i]!;
      if (extractLeadingDateIso(next) || DATE_CELL.test(next)) break;
      tailParts.push(next);
      i += 1;
    }

    const tail = tailParts.join(" ").trim();
    const row = buildFr24RowFromTail(dateIso, tail);
    if (row) out.push(row);
  }
  return out;
}

function buildFr24RowFromTail(dateIso: string, tail: string): Fr24ParsedRow | null {
  if (!tail.trim()) return null;

  const codes: string[] = [];
  for (const m of tail.matchAll(/\b([A-Z]{3})\b/g)) {
    const c = m[1]!;
    if (SKIP_IATA_LIKE.has(c)) continue;
    codes.push(c);
  }

  let fromIata: string | null = null;
  let toIata: string | null = null;
  if (codes.length >= 2) {
    fromIata = codes[0]!;
    toIata = codes[1]!;
  } else if (codes.length === 1) {
    fromIata = codes[0]!;
  }

  const regM = tail.match(/\b(A7-[A-Z0-9]+)\b/i);
  const registration = regM ? normalizeRegFromText(regM[0]!) : null;

  let aircraftCellText = tail;
  for (const code of [fromIata, toIata]) {
    if (code) aircraftCellText = aircraftCellText.replace(new RegExp(`\\b${code}\\b`, "g"), " ");
  }
  if (registration) {
    aircraftCellText = aircraftCellText.replace(new RegExp(registration.replace(/-/g, "\\-"), "i"), " ");
  }
  aircraftCellText = aircraftCellText.replace(/\s+/g, " ").trim();
  if (!aircraftCellText) aircraftCellText = tail;

  return {
    dateIso,
    fromIata,
    toIata,
    registration,
    aircraftCellText,
  };
}

/**
 * Parse FR24 flight history HTML (expects #tbl-datatable from /data/flights/qr274 style pages).
 */
/**
 * Parse FR24 flight history HTML (expects `#tbl-datatable` from /data/flights/qr274 style pages).
 * Serper renders may omit table id or cell classes — fall back to plain `<td>` and heuristic table pick.
 */
export function parseFr24FlightHistoryHtml(html: string): Fr24ParsedRow[] {
  const $ = cheerio.load(html);
  let table = $("#tbl-datatable");
  if (!table.length) {
    table = $('table[id="tbl-datatable"]');
  }
  if (!table.length) {
    table = $(".data-table#tbl-datatable, table#tbl-datatable, table.is-user").first();
  }
  if (!table.length) {
    const tables = $("table");
    for (let i = 0; i < tables.length; i++) {
      const el = tables[i];
      if (!el) continue;
      const text = $(el).text();
      if (/\/data\/airports\//i.test(text) && /\/data\/(aircraft|flights)\//i.test(text)) {
        table = $(el);
        break;
      }
    }
  }
  if (!table.length) return [];

  const out: Fr24ParsedRow[] = [];

  table.find("tbody tr").each((_, tr) => {
    const $tr = $(tr);
    let cells = $tr.find("> td.hidden-xs.hidden-sm").toArray();
    /** Serper scrape often strips CSS classes; plain `<td>` still carries airport/aircraft links. */
    if (cells.length < 4) cells = $tr.find("> td").toArray();
    if (cells.length < 4) return;

    const dateIdx = cells.findIndex((el) =>
      DATE_CELL.test($(el).text().trim()),
    );
    if (dateIdx < 0) return;

    const dateIso = parseFr24Date($(cells[dateIdx]).text().trim());
    if (!dateIso) return;

    const fromCell = cells[dateIdx + 1];
    const toCell = cells[dateIdx + 2];
    const acCell = cells[dateIdx + 3];
    if (!fromCell || !toCell || !acCell) return;

    const fromIata = airportFromHref(
      $(fromCell).find('a[href^="/data/airports/"]').first().attr("href"),
    );
    const toIata = airportFromHref(
      $(toCell).find('a[href^="/data/airports/"]').first().attr("href"),
    );

    const $ac = $(acCell).find('a[href^="/data/aircraft/"]').first();
    const registration = regFromHref($ac.attr("href"));
    const aircraftCellText = $(acCell).text().trim();

    out.push({
      dateIso,
      fromIata,
      toIata,
      registration,
      aircraftCellText,
    });
  });

  return out;
}

export function findFr24RowForDay(
  rows: Fr24ParsedRow[],
  compareDateIso: string,
  fromIata: string,
  toIata: string,
): Fr24ParsedRow | null {
  const hits = rows.filter(
    (r) =>
      r.dateIso === compareDateIso &&
      r.fromIata === fromIata &&
      r.toIata === toIata,
  );
  return hits[0] ?? null;
}

/**
 * Prefer HTML (`#tbl-datatable`), then Serper-style plain text (same endpoint as Airfleets).
 */
export function parseFr24FlightHistoryFlexible(raw: string): Fr24ParsedRow[] {
  const fromHtml = parseFr24FlightHistoryHtml(raw);
  if (fromHtml.length > 0) return fromHtml;
  return parseFr24FlightHistoryPlainText(raw);
}

/**
 * Flight history document for `flight` (e.g. `qr274`). When **`SERPER_API_KEY`** is set, uses
 * [Serper scrape](https://serper.dev) like Airfleets (avoids FR24 direct 403 from many networks).
 * Otherwise uses a direct HTTP GET (may fail with HTTP 403).
 */
export async function fetchFr24FlightHistoryHtml(flight: string): Promise<string> {
  const url = `https://www.flightradar24.com/data/flights/${flight.toLowerCase()}`;
  const { serperConfigured, scrapeUrlViaSerper } = await import("@/lib/serperScrape");
  if (serperConfigured()) {
    try {
      const json = await scrapeUrlViaSerper(url);
      const raw = json.text ?? "";
      if (!raw.trim()) throw new Error("Serper scrape returned empty text");
      return raw;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`FR24 Serper: ${msg}`);
    }
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        referer: "https://www.flightradar24.com/",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`FR24 HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(t);
  }
}
