import * as cheerio from "cheerio";
import type { AirfleetsPayload } from "@/lib/airfleets";
import {
  formatAirfleetsErrorForStorage,
  parseAirfleetsPlanePage,
  parseAirfleetsSearchForDetailUrl,
} from "@/lib/airfleets";
import type { Browser, BrowserContext, ConsoleMessage, Page } from "playwright-core";
import { chromium } from "playwright-core";

const BASE = "https://www.airfleets.net";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isVercel(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

/** Extra `[Airfleets]` lines in function logs (Vercel on by default; set `AIRFLEETS_VERBOSE_LOG=0` to mute). */
function airfleetsVerboseLogs(): boolean {
  const v = (process.env.AIRFLEETS_VERBOSE_LOG ?? "").trim().toLowerCase();
  if (v === "0" || v === "false") return false;
  if (v === "1" || v === "true") return true;
  return isVercel();
}

function trunc(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…[${s.length} chars]`;
}

function afLog(reg: string | undefined, event: string, fields: Record<string, unknown> = {}): void {
  if (!airfleetsVerboseLogs()) return;
  const safe: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(fields)) {
    if (typeof val === "string") safe[k] = trunc(val.replace(/\s+/g, " ").trim(), 500);
    else safe[k] = val;
  }
  const line = JSON.stringify({ reg: reg ?? null, event, ...safe });
  console.info(`[Airfleets] ${line}`);
}

function isBrowserOrTargetClosedMessage(msg: string): boolean {
  return /has been closed|Target closed|Browser has been closed|browser.*closed/i.test(msg);
}

/** One browser for the whole compare job; fresh context per tail. */
let sharedBrowser: Browser | null = null;

function norm(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function resetSharedBrowserIfDead(reg?: string): void {
  if (!sharedBrowser) return;
  try {
    if (!sharedBrowser.isConnected()) {
      afLog(reg, "shared_browser_not_connected_reset");
      sharedBrowser = null;
    }
  } catch {
    afLog(reg, "shared_browser_reset_after_error");
    sharedBrowser = null;
  }
}

async function getSharedBrowser(reg?: string): Promise<Browser> {
  resetSharedBrowserIfDead(reg);
  if (sharedBrowser) {
    afLog(reg, "browser_reuse", { connected: sharedBrowser.isConnected() });
    return sharedBrowser;
  }

  const t0 = Date.now();
  if (isVercel()) {
    const Chromium = (await import("@sparticuz/chromium")).default;
    const exe = await Chromium.executablePath();
    afLog(reg, "browser_launch_start", { executablePath: exe });
    // playwright-core’s bundled protocol targets Chromium ~147 (see playwright-core/browsers.json). Using an
    // older @sparticuz/chromium (e.g. 131) causes immediate disconnect: "Target page, context or browser has been closed".
    // Match major with Playwright’s Chromium, per https://www.npmjs.com/package/@sparticuz/chromium (Playwright section).
    sharedBrowser = await chromium.launch({
      args: [...Chromium.args, "--disable-blink-features=AutomationControlled"],
      executablePath: exe,
      headless: true,
      chromiumSandbox: false,
    });
    afLog(reg, "browser_launch_ok", { ms: Date.now() - t0, version: safeBrowserVersion(sharedBrowser) });
    return sharedBrowser;
  }

  const headed = process.env.PLAYWRIGHT_AIRFLEETS_HEADED === "1" || process.env.PLAYWRIGHT_AIRFLEETS_HEADED === "true";
  const channelRaw = (process.env.PLAYWRIGHT_AIRFLEETS_CHANNEL || "").trim();
  const channel =
    channelRaw === "chrome" || channelRaw === "msedge" || channelRaw === "chrome-beta"
      ? channelRaw
      : "chrome";

  const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  afLog(reg, "browser_launch_start", { channel: exe ? "executablePath" : channel });
  if (exe) {
    sharedBrowser = await chromium.launch({
      headless: !headed,
      executablePath: exe,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    });
  } else {
    sharedBrowser = await chromium.launch({
      headless: !headed,
      channel,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    });
  }
  afLog(reg, "browser_launch_ok", { ms: Date.now() - t0, version: safeBrowserVersion(sharedBrowser) });
  return sharedBrowser;
}

function safeBrowserVersion(browser: Browser): string {
  try {
    return browser.version();
  } catch {
    return "?";
  }
}

function safePageUrl(page: Page): string {
  try {
    return page.url();
  } catch {
    return "<unreadable>";
  }
}

function attachPageDebugListeners(page: Page, reg: string): () => void {
  if (!airfleetsVerboseLogs()) return () => {};

  const onConsole = (msg: ConsoleMessage) => {
    try {
      afLog(reg, "page_console", { type: msg.type(), text: msg.text() });
    } catch {
      /* ignore */
    }
  };
  const onPageError = (err: Error) => {
    afLog(reg, "page_error", { message: err.message, stack: err.stack ?? "" });
  };
  const onCrash = () => {
    afLog(reg, "page_crash", {});
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("crash", onCrash);
  return () => {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("crash", onCrash);
  };
}

async function snapshotSearchPage(page: Page, html: string, reg: string, searchUrl: string): Promise<Record<string, unknown>> {
  const url = safePageUrl(page);
  const hasPlaneLink = !!parseAirfleetsSearchForDetailUrl(html, reg, searchUrl);
  const lower = html.slice(0, 8000).toLowerCase();
  const keywordHits = ["captcha", "cloudflare", "turnstile", "challenge", "access denied", "403", "forbidden"].filter(
    (k) => lower.includes(k),
  );
  let robotCount = -1;
  let cfCount = -1;
  let tabRowCount = -1;
  try {
    robotCount = await page
      .locator('form[action*="turnstile2"] input[type="submit"], input[type="submit"]')
      .filter({ hasText: /not a robot|robot/i })
      .count();
  } catch {
    /* page may be closing */
  }
  try {
    cfCount = await page
      .locator(
        "#challenge-running, .cf-browser-verification, #challenge-stage, iframe[src*='challenges.cloudflare']",
      )
      .count();
  } catch {
    /* ignore */
  }
  try {
    tabRowCount = await page.locator('tr.tabcontent, tr[class*="tabcontent"], tr[class*="Tabcontent"]').count();
  } catch {
    /* ignore */
  }
  let title = "";
  try {
    title = await page.title();
  } catch {
    /* ignore */
  }
  let frameUrls = "";
  try {
    frameUrls = trunc(
      page
        .frames()
        .map((f) => f.url())
        .join(" | "),
      400,
    );
  } catch {
    /* ignore */
  }
  const thin = html.length < 1500;
  return {
    url,
    htmlLen: html.length,
    hasPlaneLink,
    tabRowCount,
    robotCount,
    cfCount,
    frames: page.frames().length,
    frameUrls: thin ? frameUrls : undefined,
    keywordHits: keywordHits.join(","),
    title: trunc(title, 120),
    ...(thin ? { bodyPreview: trunc(html.replace(/\s+/g, " ").trim(), 500) } : {}),
  };
}

async function snapshotPlanePage(page: Page, html: string, detailUrl: string): Promise<Record<string, unknown>> {
  const url = safePageUrl(page);
  const parsed = parseAirfleetsPlanePage(html, detailUrl);
  const hasAny = !!(parsed.msn || parsed.type || parsed.aircraftFamily || parsed.seatConfigRaw);
  const lower = html.slice(0, 6000).toLowerCase();
  const keywordHits = ["captcha", "cloudflare", "turnstile", "challenge"].filter((k) => lower.includes(k));
  let robotCount = -1;
  try {
    robotCount = await page
      .locator('form[action*="turnstile2"] input[type="submit"], input[type="submit"]')
      .filter({ hasText: /not a robot|robot/i })
      .count();
  } catch {
    /* ignore */
  }
  return {
    url,
    htmlLen: html.length,
    hasParsedFields: hasAny,
    msn: parsed.msn ?? "",
    type: parsed.type ?? "",
    robotCount,
    keywordHits: keywordHits.join(","),
  };
}

/** Match @sparticuz/chromium / Playwright 147 so the site does not serve a bare document to an “old” client. */
const CHROME_147_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

async function newAirfleetsContext(reg: string): Promise<BrowserContext> {
  const browser = await getSharedBrowser(reg);
  afLog(reg, "context_new", { browserConnected: browser.isConnected() });
  const context = await browser.newContext({
    userAgent: CHROME_147_UA,
    viewport: { width: 1365, height: 900 },
    locale: "en-US",
    timezoneId: "Europe/Amsterdam",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Upgrade-Insecure-Requests": "1",
      "sec-ch-ua": '"Chromium";v="147", "Google Chrome";v="147", "Not?A_Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return context;
}

/**
 * Close shared browser (call after compare job when using browser mode).
 */
export async function closeAirfleetsPlaywright(): Promise<void> {
  if (!sharedBrowser) return;
  try {
    await sharedBrowser.close();
  } catch {
    /* ignore */
  }
  sharedBrowser = null;
}

/** Navigate like a cold browser session: wait for `load`, then try `networkidle` (bounded) so JS-heavy pages fill in. */
async function airfleetsNavigate(page: Page, reg: string, url: string, event: string): Promise<void> {
  afLog(reg, event, { url });
  const res = await page.goto(url, { waitUntil: "load", timeout: 120_000 });
  const status = res?.status() ?? null;
  await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => {
    afLog(reg, `${event}_networkidle_skipped`, { status });
  });
  const html = await page.content();
  afLog(reg, `${event}_done`, {
    finalUrl: safePageUrl(page),
    status,
    htmlLen: html.length,
    frames: page.frames().length,
    ...(html.length < 1500 ? { bodyPreview: trunc(html.replace(/\s+/g, " ").trim(), 500) } : {}),
  });
}

/**
 * Hit site root first (same idea as HTTP bootstrap in airfleets.ts) so CDN/session cookies exist before search.
 * `domcontentloaded` alone often yields ~empty HTML on first paint for this stack.
 */
async function settleSearchPage(page: Page, searchUrl: string, registration: string): Promise<void> {
  const reg = registration.toUpperCase().trim();
  const home = `${BASE}/`;
  await airfleetsNavigate(page, reg, home, "session_home");
  await sleep(2000);
  await airfleetsNavigate(page, reg, searchUrl, "search_goto");
  await sleep(2500);

  const deadline = Date.now() + 120_000;
  let reloads = 0;
  let lastProgressLog = Date.now();

  while (Date.now() < deadline) {
    const html = await page.content();
    if (parseAirfleetsSearchForDetailUrl(html, reg, searchUrl)) {
      afLog(reg, "search_settled_ok", await snapshotSearchPage(page, html, reg, searchUrl));
      return;
    }

    if (airfleetsVerboseLogs() && Date.now() - lastProgressLog >= 20_000) {
      lastProgressLog = Date.now();
      afLog(reg, "search_still_waiting", { reloads, ...(await snapshotSearchPage(page, html, reg, searchUrl)) });
    }

    const robot = page
      .locator('form[action*="turnstile2"] input[type="submit"], input[type="submit"]')
      .filter({ hasText: /not a robot|robot/i });
    if ((await robot.count()) > 0) {
      afLog(reg, "search_robot_button_click", {});
      await robot.first().click();
      await sleep(12_000);
      continue;
    }

    const url = page.url().toLowerCase();
    if (url.includes("captcha")) {
      afLog(reg, "search_url_has_captcha_reload", { url: page.url() });
      await airfleetsNavigate(page, reg, searchUrl, "search_reload_captcha");
      await sleep(3000);
      continue;
    }

    const cf = page.locator(
      "#challenge-running, .cf-browser-verification, #challenge-stage, iframe[src*='challenges.cloudflare']",
    );
    const cfN = await cf.count();
    if (cfN > 0) {
      afLog(reg, "search_cloudflare_like_wait", { cfN });
      await sleep(4000);
      continue;
    }

    reloads += 1;
    const thin = html.length < 2000;
    if (thin || reloads % 5 === 0) {
      afLog(reg, thin ? "search_reload_thin_document" : "search_periodic_reload", { reloads, htmlLen: html.length });
      if (thin) {
        await airfleetsNavigate(page, reg, home, "session_home_retry");
        await sleep(1500);
      }
      await airfleetsNavigate(page, reg, searchUrl, "search_reload");
      await sleep(2000);
    } else {
      await sleep(2200);
    }
  }

  const last = await page.content().catch(() => "");
  const snap = last ? await snapshotSearchPage(page, last, reg, searchUrl) : { note: "page.content failed" };
  afLog(reg, "search_timeout_final", snap);
  if (!parseAirfleetsSearchForDetailUrl(last, reg, searchUrl)) {
    throw new Error("Airfleets search did not return a plane link within 120s (captcha or layout change).");
  }
}

async function settlePlanePage(page: Page, detailUrl: string, reg: string): Promise<string> {
  await airfleetsNavigate(page, reg, detailUrl, "plane_goto");
  await sleep(2000);

  const deadline = Date.now() + 90_000;
  let lastPlaneLog = Date.now();

  while (Date.now() < deadline) {
    const html = await page.content();
    const parsed = parseAirfleetsPlanePage(html, detailUrl);
    if (parsed.msn || parsed.type || parsed.aircraftFamily || parsed.seatConfigRaw) {
      afLog(reg, "plane_settled_ok", await snapshotPlanePage(page, html, detailUrl));
      return html;
    }

    if (airfleetsVerboseLogs() && Date.now() - lastPlaneLog >= 20_000) {
      lastPlaneLog = Date.now();
      afLog(reg, "plane_still_waiting", await snapshotPlanePage(page, html, detailUrl));
    }

    const robot = page
      .locator('form[action*="turnstile2"] input[type="submit"], input[type="submit"]')
      .filter({ hasText: /not a robot|robot/i });
    if ((await robot.count()) > 0) {
      afLog(reg, "plane_robot_button_click", {});
      await robot.first().click();
      await sleep(12_000);
      continue;
    }

    await sleep(2500);
  }

  const html = await page.content();
  afLog(reg, "plane_timeout_fallback_html", await snapshotPlanePage(page, html, detailUrl));
  return html;
}

/**
 * Airfleets via real Chromium: **@sparticuz/chromium** on Vercel (small Linux build), **playwright-core**
 * with installed **Google Chrome** channel locally (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`).
 */
export async function fetchAirfleetsWithPlaywright(registration: string): Promise<AirfleetsPayload> {
  const fetchedAt = new Date().toISOString();
  const reg = registration.toUpperCase().trim();
  if (!reg || reg.length < 4) {
    return { fetchedAt, error: "Missing or too-short registration for Airfleets lookup." };
  }

  const searchUrl = `${BASE}/recherche/?key=${encodeURIComponent(reg)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let detachListeners: (() => void) | undefined;

    try {
      resetSharedBrowserIfDead(reg);
      context = await newAirfleetsContext(reg);
      page = await context.newPage();
      detachListeners = attachPageDebugListeners(page, reg);
      afLog(reg, "page_open", { attempt });

      await settleSearchPage(page, searchUrl, reg);
      const searchHtml = await page.content();

      const detailUrl = parseAirfleetsSearchForDetailUrl(searchHtml, reg, searchUrl);
      if (!detailUrl) {
        afLog(reg, "search_parse_no_detail_url", {
          ...(await snapshotSearchPage(page, searchHtml, reg, searchUrl)),
        });
        return { fetchedAt, searchUrl, error: "No matching aircraft row on Airfleets search." };
      }
      afLog(reg, "search_detail_url", { detailUrl });

      const planeHtml = await settlePlanePage(page, detailUrl, reg);
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

      afLog(reg, "fetch_ok", { detailUrl, hasMsn: !!parsed.msn });
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
      const stack = e instanceof Error ? e.stack : undefined;
      afLog(reg, "fetch_caught", { attempt, message: msg, stack: stack ? trunc(stack, 800) : "" });

      if (attempt === 0 && isBrowserOrTargetClosedMessage(msg)) {
        afLog(reg, "fetch_will_retry_after_closed_browser", { attempt });
        await closeAirfleetsPlaywright();
        continue;
      }

      return { fetchedAt, searchUrl, error: formatAirfleetsErrorForStorage(msg) };
    } finally {
      detachListeners?.();
      await page?.close().catch(() => {});
      await context?.close().catch(() => {});
    }
  }

  return {
    fetchedAt,
    searchUrl,
    error: formatAirfleetsErrorForStorage("Airfleets browser closed repeatedly; give up after retry."),
  };
}
