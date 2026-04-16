/**
 * One-off probe: Airfleets search with Playwright (captcha / CF need a real browser).
 * Usage: node scripts/airfleets-playwright-probe.mjs A7-ALK
 */
import { chromium } from "playwright-core";

const reg = (process.argv[2] || "A7-ALK").toUpperCase();
const searchUrl = `https://www.airfleets.net/recherche/?key=${encodeURIComponent(reg)}`;

const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
const browser = await chromium.launch(
  exe
    ? {
        headless: true,
        executablePath: exe,
        args: ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage", "--no-sandbox"],
      }
    : {
        headless: true,
        channel: "chrome",
        args: ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage", "--no-sandbox"],
      },
);

const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: { width: 1365, height: 900 },
  locale: "en-US",
});

await context.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
});

const page = await context.newPage();
try {
  console.log("goto", searchUrl);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  console.log("url after goto:", page.url());

  for (let i = 0; i < 3; i++) {
    const robot = page.locator('form[action*="turnstile2"] input[type="submit"], input[type="submit"][value*="robot"]');
    if ((await robot.count()) > 0) {
      console.log("clicking I am not a robot, round", i);
      await robot.first().click();
      await new Promise((r) => setTimeout(r, 10_000));
    }
    if (page.url().includes("captcha") && (await robot.count()) === 0) break;
    if (!(await page.locator("tr.tabcontent").count())) {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await new Promise((r) => setTimeout(r, 2000));
    } else break;
  }

  await page.waitForSelector('tr.tabcontent, tr[class*="tabcontent"]', { timeout: 90_000 });
  const html = await page.content();
  console.log("OK length", html.length, "has tabcontent", html.includes("tabcontent"));
  const m = html.match(/ficheapp\/plane-[^"']+\.htm/);
  console.log("plane link sample:", m ? m[0] : "(none)");
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
