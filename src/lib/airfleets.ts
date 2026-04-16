import * as cheerio from "cheerio";

const BASE = "https://www.airfleets.net";

export type AirfleetsPayload = {
  fetchedAt: string;
  error?: string;
  searchUrl?: string;
  detailUrl?: string;
  aircraftFamily?: string | null;
  airline?: string | null;
  lineStatus?: string | null;
  msn?: string | null;
  type?: string | null;
  firstFlightDate?: string | null;
  testRegistration?: string | null;
  planeAge?: string | null;
  hexCode?: string | null;
  engines?: string | null;
  seatConfigRaw?: string | null;
  businessSeats?: number | null;
  economySeats?: number | null;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function norm(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function fetchHtml(url: string, referer: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 22_000);
  return fetch(url, {
    signal: ctrl.signal,
    redirect: "follow",
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      referer,
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "upgrade-insecure-requests": "1",
    },
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Airfleets HTTP ${res.status}`);
      return res.text();
    })
    .finally(() => clearTimeout(t));
}

/** Resolve relative links from search page. */
function toAbsolute(href: string, fromUrl: string): string {
  try {
    return new URL(href, fromUrl).href;
  } catch {
    return href.startsWith("http") ? href : `${BASE}/${href.replace(/^\.\//, "")}`;
  }
}

/**
 * From search results HTML, find the detail page URL for the given registration.
 */
export function parseAirfleetsSearchForDetailUrl(html: string, registration: string, searchUrl: string): string | null {
  const $ = cheerio.load(html);
  const reg = registration.toUpperCase().trim();
  const rows = $('tr.tabcontent, tr[class*="tabcontent"]').toArray();
  for (const tr of rows) {
    const $tr = $(tr);
    const rowText = norm($tr.text()).toUpperCase();
    if (!rowText.includes(reg)) continue;
    const msnLink = $tr.find('a[href*="ficheapp/plane-"]').first();
    const href = msnLink.attr("href");
    if (!href) continue;
    if (!href.includes("plane-")) continue;
    return toAbsolute(href, searchUrl);
  }
  const fallback = $(`a[href*="ficheapp/plane-"]`).filter((_, el) => norm($(el).text()) === reg).first();
  const h = fallback.attr("href");
  return h ? toAbsolute(h, searchUrl) : null;
}

function parseSeatCounts(blob: string): { business: number | null; economy: number | null } {
  const t = blob.replace(/\u00a0/g, " ");
  const c = t.match(/C(\d+)/i);
  const y = t.match(/Y(\d+)/i);
  return {
    business: c ? parseInt(c[1]!, 10) : null,
    economy: y ? parseInt(y[1]!, 10) : null,
  };
}

/**
 * Parse aircraft detail page (e.g. plane-a350-33.htm).
 */
export function parseAirfleetsPlanePage(html: string, detailUrl: string): Omit<AirfleetsPayload, "fetchedAt" | "searchUrl" | "error"> {
  const $ = cheerio.load(html);
  const out: Omit<AirfleetsPayload, "fetchedAt" | "searchUrl" | "error"> = {
    detailUrl,
  };

  $("table tr").each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr.children("td").toArray();
    if (cells.length !== 2) return;
    const label = norm($(cells[0]).text()).toLowerCase();
    const $val = $(cells[1]);
    let value = norm($val.text());
    if (label.startsWith("serial number")) out.msn = value || null;
    else if (label === "type") out.type = value || null;
    else if (label.startsWith("first flight")) out.firstFlightDate = value || null;
    else if (label.startsWith("test registration")) out.testRegistration = value || null;
    else if (label.startsWith("plane age")) out.planeAge = value || null;
    else if (label.includes("seat") && label.includes("config")) {
      const rawHtml = $val.html() ?? "";
      out.seatConfigRaw = value || null;
      const counts = parseSeatCounts(`${rawHtml} ${value}`);
      out.businessSeats = counts.business;
      out.economySeats = counts.economy;
    } else if (label.startsWith("hex code")) {
      const a = $val.find("a").first();
      out.hexCode = norm(a.text() || value) || null;
    } else if (label.startsWith("engines")) out.engines = value || null;
  });

  const h1 = norm($("h1").first().text());
  if (h1) {
    const m = h1.match(/^(.+?)\s*-\s*MSN\s+(\d+)/i);
    if (m) {
      out.aircraftFamily = m[1]!.trim();
      if (!out.msn) out.msn = m[2]!.trim();
    }
  }

  return out;
}

/**
 * Fetch search + detail from Airfleets.net for a Qatar-style registration (e.g. A7-ALK).
 * Best-effort HTML scrape — fragile; failures return `{ error, fetchedAt }`.
 */
export async function fetchAirfleetsForRegistration(registration: string): Promise<AirfleetsPayload> {
  const fetchedAt = new Date().toISOString();
  const reg = registration.toUpperCase().trim();
  if (!reg || reg.length < 4) {
    return { fetchedAt, error: "Missing or too-short registration for Airfleets lookup." };
  }

  const searchUrl = `${BASE}/recherche/?key=${encodeURIComponent(reg)}`;

  try {
    const searchHtml = await fetchHtml(searchUrl, `${BASE}/home/`);
    const detailUrl = parseAirfleetsSearchForDetailUrl(searchHtml, reg, searchUrl);
    if (!detailUrl) {
      return { fetchedAt, searchUrl, error: "No matching aircraft row on Airfleets search." };
    }

    const planeHtml = await fetchHtml(detailUrl, searchUrl);
    const parsed = parseAirfleetsPlanePage(planeHtml, detailUrl);

    let airline: string | null = null;
    let lineStatus: string | null = null;
    const $s = cheerio.load(searchHtml);
    $s('tr.tabcontent, tr[class*="tabcontent"]').each((_, tr) => {
      const $tr = $s(tr);
      if (!norm($tr.text()).toUpperCase().includes(reg)) return;
      const tds = $tr.find("> td").toArray();
      if (tds.length >= 5) {
        airline = norm($s(tds[3]).text()) || null;
        lineStatus = norm($s(tds[4]).text()) || null;
      }
    });

    return {
      fetchedAt,
      searchUrl,
      detailUrl,
      airline,
      lineStatus,
      ...parsed,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { fetchedAt, searchUrl, error: msg };
  }
}
