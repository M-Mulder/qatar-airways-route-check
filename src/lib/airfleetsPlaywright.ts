import * as cheerio from "cheerio";
import type { AirfleetsPayload } from "@/lib/airfleets";
import {
  formatAirfleetsErrorForStorage,
  parseAirfleetsPlanePage,
  parseAirfleetsSearchForDetailUrl,
} from "@/lib/airfleets";
import type { Browser, BrowserContext } from "playwright";

const BASE = "https://www.airfleets.net";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One Chromium process for the whole compare job; **fresh context per tail** so Cloudflare/captcha state does not stick across registrations. */
let sharedBrowser: Browser | null = null;

function norm(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser) return sharedBrowser;
  /** Hermetic install on Vercel (`postinstall`); must match runtime so Chromium is found. */
  if (process.env.VERCEL === "1" && process.env.PLAYWRIGHT_BROWSERS_PATH === undefined) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
  }
  const { chromium } = await import("playwright");
  const headed = process.env.PLAYWRIGHT_AIRFLEETS_HEADED === "1" || process.env.PLAYWRIGHT_AIRFLEETS_HEADED === "true";
  const channelRaw = (process.env.PLAYWRIGHT_AIRFLEETS_CHANNEL || "").trim();
  const channel =
    channelRaw === "chrome" || channelRaw === "msedge" || channelRaw === "chrome-beta" ? channelRaw : undefined;
  sharedBrowser = await chromium.launch({
    headless: !headed,
    channel,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });
  return sharedBrowser;
}

async function newAirfleetsContext(): Promise<BrowserContext> {
  const browser = await getSharedBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1365, height: 900 },
    locale: "en-US",
    timezoneId: "Europe/Amsterdam",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return context;
}

/**
 * Close shared Playwright browser (call after compare job when using browser mode).
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

/**
 * Wait until search HTML contains a parseable plane link. Do not rely on Playwright "visible"
 * checks — Cloudflare overlays and late paint often keep `tr.tabcontent` attached but not visible.
 */
async function settleSearchPage(
  page: import("playwright").Page,
  searchUrl: string,
  registration: string,
): Promise<void> {
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await sleep(2500);

  const reg = registration.toUpperCase().trim();
  const deadline = Date.now() + 120_000;
  let reloads = 0;

  while (Date.now() < deadline) {
    const html = await page.content();
    if (parseAirfleetsSearchForDetailUrl(html, reg, searchUrl)) return;

    const robot = page
      .locator('form[action*="turnstile2"] input[type="submit"], input[type="submit"]')
      .filter({ hasText: /not a robot|robot/i });
    if ((await robot.count()) > 0) {
      await robot.first().click();
      await sleep(12_000);
      continue;
    }

    const url = page.url().toLowerCase();
    if (url.includes("captcha")) {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await sleep(3000);
      continue;
    }

    // Cloudflare / challenge overlay: wait for it to clear, then re-check.
    const cf = page.locator(
      "#challenge-running, .cf-browser-verification, #challenge-stage, iframe[src*='challenges.cloudflare']",
    );
    if ((await cf.count()) > 0) {
      await sleep(4000);
      continue;
    }

    reloads += 1;
    if (reloads % 5 === 0) {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await sleep(2000);
    } else {
      await sleep(2200);
    }
  }

  const last = await page.content();
  if (!parseAirfleetsSearchForDetailUrl(last, reg, searchUrl)) {
    throw new Error("Airfleets search did not return a plane link within 120s (captcha or layout change).");
  }
}

async function settlePlanePage(page: import("playwright").Page, detailUrl: string): Promise<string> {
  await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await sleep(2000);

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const html = await page.content();
    const parsed = parseAirfleetsPlanePage(html, detailUrl);
    if (parsed.msn || parsed.type || parsed.aircraftFamily || parsed.seatConfigRaw) {
      return html;
    }

    const robot = page
      .locator('form[action*="turnstile2"] input[type="submit"], input[type="submit"]')
      .filter({ hasText: /not a robot|robot/i });
    if ((await robot.count()) > 0) {
      await robot.first().click();
      await sleep(12_000);
      continue;
    }

    await sleep(2500);
  }

  return await page.content();
}

/**
 * Real Chromium session — Airfleets uses captcha / Cloudflare gates that block plain `fetch`.
 * Use on Node locally or any host with Playwright browsers installed; not for Vercel serverless.
 */
export async function fetchAirfleetsWithPlaywright(registration: string): Promise<AirfleetsPayload> {
  const fetchedAt = new Date().toISOString();
  const reg = registration.toUpperCase().trim();
  if (!reg || reg.length < 4) {
    return { fetchedAt, error: "Missing or too-short registration for Airfleets lookup." };
  }

  const searchUrl = `${BASE}/recherche/?key=${encodeURIComponent(reg)}`;

  const context = await newAirfleetsContext();
  const page = await context.newPage();

  try {
    await settleSearchPage(page, searchUrl, reg);
    const searchHtml = await page.content();

    const detailUrl = parseAirfleetsSearchForDetailUrl(searchHtml, reg, searchUrl);
    if (!detailUrl) {
      return { fetchedAt, searchUrl, error: "No matching aircraft row on Airfleets search." };
    }

    const planeHtml = await settlePlanePage(page, detailUrl);
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
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}
