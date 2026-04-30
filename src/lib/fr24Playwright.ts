/**
 * Real-browser fetch for Flightradar24 flight history when Serper/plain HTTP return empty or blocked parses.
 * Uses the same Chromium strategy as Airfleets (`@sparticuz/chromium` on Vercel, Chrome channel locally).
 */

import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";

let sharedBrowser: Browser | null = null;

function isVercel(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

/**
 * FR24 Playwright loads full `#tbl-datatable` HTML when direct HTTP and Serper scrape return nothing parsable (common
 * on Vercel: FR24 blocks datacenter IPs; Serper often returns a short text stub).
 *
 * `compareJob` **closes FR24 Chromium after the FR24 batch** before Airfleets opens its browser — stacking both at
 * once was the main source of `browserContext.newPage` / memory failures.
 *
 * Override: **`FR24_PLAYWRIGHT=0`** disables FR24 Playwright everywhere (cron will persist error stubs instead).
 */
export function fr24PlaywrightFallbackEnabled(): boolean {
  const v = (process.env.FR24_PLAYWRIGHT ?? "").trim().toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return true;
}

async function getBrowser(): Promise<Browser> {
  try {
    if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;
  } catch {
    sharedBrowser = null;
  }
  sharedBrowser = null;

  const t0 = Date.now();
  if (isVercel()) {
    const Chromium = (await import("@sparticuz/chromium")).default;
    const exe = await Chromium.executablePath();
    const sparticuzArgs = Chromium.args.filter(
      (a) => a !== "--enable-automation" && !a.startsWith("--enable-automation="),
    );
    sharedBrowser = await chromium.launch({
      args: [...sparticuzArgs, "--disable-blink-features=AutomationControlled"],
      executablePath: exe,
      headless: true,
      chromiumSandbox: false,
    });
    console.info(`[FR24 Playwright] browser launched (Vercel) ms=${Date.now() - t0}`);
    return sharedBrowser;
  }

  const headed = process.env.PLAYWRIGHT_FR24_HEADED === "1" || process.env.PLAYWRIGHT_FR24_HEADED === "true";
  const exePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (exePath) {
    sharedBrowser = await chromium.launch({
      headless: !headed,
      executablePath: exePath,
      args: ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage", "--no-sandbox"],
    });
  } else {
    sharedBrowser = await chromium.launch({
      headless: !headed,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage", "--no-sandbox"],
    });
  }
  console.info(`[FR24 Playwright] browser launched (local) ms=${Date.now() - t0}`);
  return sharedBrowser;
}

/**
 * Load FR24 `/data/flights/{flight}` in headless Chromium and return full HTML for `#tbl-datatable` parsing.
 */
export async function fetchFr24HtmlViaPlaywright(flight: string): Promise<string> {
  const url = `https://www.flightradar24.com/data/flights/${flight.toLowerCase()}`;
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1400, height: 900 },
    locale: "en-US",
    timezoneId: "Europe/Amsterdam",
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("#tbl-datatable", { timeout: 28_000 });
    await page.waitForSelector("#tbl-datatable tbody tr", { timeout: 8_000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    const html = await page.content();
    if (html.length < 800) {
      throw new Error("FR24 Playwright: HTML too short (blocked page or empty shell)");
    }
    return html;
  } finally {
    await ctx.close();
  }
}

export async function closeFr24Playwright(): Promise<void> {
  if (!sharedBrowser) return;
  try {
    await sharedBrowser.close();
  } catch {
    /* noop */
  }
  sharedBrowser = null;
}
