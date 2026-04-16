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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function norm(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

/** Set-Cookie lines → `Cookie` header value (name=value only). */
function cookieHeaderFromResponse(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const lines = typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
  return lines
    .map((line) => line.split(";")[0]!.trim())
    .filter(Boolean)
    .join("; ");
}

function mergeCookieHeader(existing: string, add: string): string {
  const m = new Map<string, string>();
  for (const chunk of `${existing}; ${add}`.split(";")) {
    const p = chunk.trim();
    if (!p) continue;
    const i = p.indexOf("=");
    if (i > 0) m.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  return [...m].map(([a, b]) => `${a}=${b}`).join("; ");
}

function secFetchSiteForReferer(referer: string): "same-origin" | "same-site" | "cross-site" | "none" {
  try {
    const r = new URL(referer);
    const b = new URL(BASE);
    if (r.origin === b.origin) return "same-origin";
    return "cross-site";
  } catch {
    return "cross-site";
  }
}

function browserHeaders(referer: string, cookie?: string): Record<string, string> {
  const h: Record<string, string> = {
    "user-agent": UA,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
  };
  if (referer) {
    h.referer = referer;
    h["sec-fetch-site"] = secFetchSiteForReferer(referer);
  } else {
    h["sec-fetch-site"] = "none";
  }
  if (cookie?.trim()) h.cookie = cookie;
  return h;
}

async function fetchHtmlStep(
  url: string,
  referer: string,
  cookie: string,
): Promise<{ html: string; cookie: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 22_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: browserHeaders(referer, cookie || undefined),
      cache: "no-store",
    });
    const next = mergeCookieHeader(cookie, cookieHeaderFromResponse(res));
    if (!res.ok) throw new Error(`Airfleets HTTP ${res.status}`);
    const html = await res.text();
    return { html, cookie: next };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Establish a session cookie (many CDNs return 403 on “cold” search without a prior site hit).
 */
async function bootstrapAirfleetsCookie(): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${BASE}/`, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: browserHeaders("", undefined),
      cache: "no-store",
    });
    return cookieHeaderFromResponse(res);
  } finally {
    clearTimeout(t);
  }
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
  const rows = $('tr.tabcontent, tr[class*="tabcontent"], tr[class*="Tabcontent"]').toArray();
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
  const exactLink = $(`a[href*="ficheapp/plane-"]`).filter((_, el) => norm($(el).text()).toUpperCase() === reg).first();
  const exactHref = exactLink.attr("href");
  if (exactHref?.includes("plane-")) return toAbsolute(exactHref, searchUrl);

  /** Any plane link in a table row whose text includes the registration (live HTML varies). */
  let fromRow: string | null = null;
  $(`a[href*="ficheapp/plane-"]`).each((_, el) => {
    if (fromRow) return false;
    const $a = $(el);
    const $tr = $a.closest("tr");
    const blob = $tr.length ? norm($tr.text()) : norm($a.text());
    if (!blob.toUpperCase().includes(reg)) return;
    const href = $a.attr("href");
    if (href?.includes("plane-")) {
      fromRow = toAbsolute(href, searchUrl);
      return false;
    }
  });
  return fromRow;
}

export function parseSeatCounts(blob: string): { business: number | null; economy: number | null } {
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
 * Plain HTTP fetch (no JS). Airfleets often returns 403 / captcha redirect — use Playwright locally instead.
 */
export async function fetchAirfleetsHttp(registration: string): Promise<AirfleetsPayload> {
  const fetchedAt = new Date().toISOString();
  const reg = registration.toUpperCase().trim();
  if (!reg || reg.length < 4) {
    return { fetchedAt, error: "Missing or too-short registration for Airfleets lookup." };
  }

  const searchUrl = `${BASE}/recherche/?key=${encodeURIComponent(reg)}`;

  try {
    let cookie = await bootstrapAirfleetsCookie();
    let searchHtml: string;
    try {
      const step = await fetchHtmlStep(searchUrl, `${BASE}/`, cookie);
      searchHtml = step.html;
      cookie = step.cookie;
    } catch (first) {
      const msg = first instanceof Error ? first.message : String(first);
      if (!msg.includes("403")) throw first;
      await new Promise((r) => setTimeout(r, 750));
      cookie = mergeCookieHeader(cookie, await bootstrapAirfleetsCookie());
      const step = await fetchHtmlStep(searchUrl, `${BASE}/`, cookie);
      searchHtml = step.html;
      cookie = step.cookie;
    }

    const detailUrl = parseAirfleetsSearchForDetailUrl(searchHtml, reg, searchUrl);
    if (!detailUrl) {
      return { fetchedAt, searchUrl, error: "No matching aircraft row on Airfleets search." };
    }

    const planeStep = await fetchHtmlStep(detailUrl, searchUrl, cookie);
    const planeHtml = planeStep.html;
    const parsed = parseAirfleetsPlanePage(planeHtml, detailUrl);

    let airline: string | null = null;
    let lineStatus: string | null = null;
    const $s = cheerio.load(searchHtml);
    $s('tr.tabcontent, tr[class*="tabcontent"], tr[class*="Tabcontent"]').each((_, tr) => {
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
    return { fetchedAt, searchUrl, error: formatAirfleetsErrorForStorage(msg) };
  }
}

function usePlaywrightForAirfleets(): boolean {
  if (process.env.AIRFLEETS_BROWSER === "0" || process.env.AIRFLEETS_BROWSER === "false") return false;
  return true;
}

/**
 * Fetch search + detail from Airfleets.net for a Qatar-style registration (e.g. A7-ALK).
 *
 * Order: **`SERPER_API_KEY`** → [Serper scrape](https://serper.dev) (recommended on Vercel). Else if
 * **`GOOGLE_CSE_API_KEY`** + **`GOOGLE_CSE_ID`** → Programmable Search JSON. Else if browser mode on →
 * **playwright-core** + **@sparticuz/chromium** (Vercel) or **Chrome** locally. Set **`AIRFLEETS_BROWSER=0`**
 * to skip Playwright and use fragile HTTP-only fetches.
 */
export async function fetchAirfleetsForRegistration(registration: string): Promise<AirfleetsPayload> {
  const { serperConfigured, fetchAirfleetsWithSerper } = await import("@/lib/airfleetsSerper");
  if (serperConfigured()) {
    return fetchAirfleetsWithSerper(registration);
  }

  if (!usePlaywrightForAirfleets()) {
    return fetchAirfleetsHttp(registration);
  }

  const { googleCseConfigured, googleCsePayloadLooksUsable, tryFetchAirfleetsFromGoogleCse } = await import(
    "@/lib/airfleetsGoogleCse"
  );
  if (googleCseConfigured()) {
    const fromCse = await tryFetchAirfleetsFromGoogleCse(registration);
    if (fromCse && googleCsePayloadLooksUsable(fromCse)) {
      return fromCse;
    }
  }

  try {
    const { fetchAirfleetsWithPlaywright } = await import("@/lib/airfleetsPlaywright");
    return await fetchAirfleetsWithPlaywright(registration);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Cannot find module ['"]playwright-core['"]|playwright-core|@sparticuz\/chromium/i.test(msg)) {
      return fetchAirfleetsHttp(registration);
    }
    const reg = registration.toUpperCase().trim();
    const searchUrl = `${BASE}/recherche/?key=${encodeURIComponent(reg)}`;
    return {
      fetchedAt: new Date().toISOString(),
      searchUrl,
      error: formatAirfleetsErrorForStorage(msg),
    };
  }
}

/** User-facing error line (also stored in JSON). */
export function formatAirfleetsErrorForStorage(raw: string): string {
  if (/\b403\b|forbidden/i.test(raw)) {
    return "Airfleets returned HTTP 403 (plain HTTP is blocked by captcha/Cloudflare). Ensure browser mode is enabled (default), or open the search link in a desktop browser.";
  }
  return raw;
}
