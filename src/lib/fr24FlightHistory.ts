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

/**
 * Parse FR24 flight history HTML (expects #tbl-datatable from /data/flights/qr274 style pages).
 */
export function parseFr24FlightHistoryHtml(html: string): Fr24ParsedRow[] {
  const $ = cheerio.load(html);
  const table = $("#tbl-datatable");
  if (!table.length) return [];

  const out: Fr24ParsedRow[] = [];

  table.find("tbody tr").each((_, tr) => {
    const $tr = $(tr);

    const dateText = $tr
      .find("td.hidden-xs.hidden-sm")
      .filter((_, el) => DATE_CELL.test($(el).text().trim()))
      .first()
      .text()
      .trim();
    const dateIso = dateText ? parseFr24Date(dateText) : null;
    if (!dateIso) return;

    const apEls = $tr.find('a[href^="/data/airports/"]').toArray();
    const fromIata = apEls[0] ? airportFromHref($(apEls[0]).attr("href")) : null;
    const toIata = apEls[1] ? airportFromHref($(apEls[1]).attr("href")) : null;

    const $ac = $tr.find('a[href^="/data/aircraft/"]').first();
    const registration = regFromHref($ac.attr("href"));
    const $acTd = $ac.closest("td");
    const aircraftCellText = $acTd.length ? $acTd.text().trim() : $ac.text().trim();

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

export async function fetchFr24FlightHistoryHtml(flight: string): Promise<string> {
  const url = `https://www.flightradar24.com/data/flights/${flight.toLowerCase()}`;
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
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`FR24 HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(t);
  }
}
