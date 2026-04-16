/**
 * During Vercel build (`VERCEL=1`), install Chromium next to `node_modules` so it is traced into
 * the serverless bundle (`PLAYWRIGHT_BROWSERS_PATH=0`). Skips on normal local `npm install` to
 * keep installs fast (run `npx playwright install chromium` locally once).
 *
 * Force local install: PLAYWRIGHT_INSTALL_CHROMIUM=1 npm install
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const onVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";
const force = process.env.PLAYWRIGHT_INSTALL_CHROMIUM === "1";

if (!onVercel && !force) {
  console.log("[playwright-install] skip (not Vercel; use `npx playwright install chromium` locally)");
  process.exit(0);
}

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
}

console.log(
  `[playwright-install] npx playwright install chromium (PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH})`,
);
execSync("npx playwright install chromium", {
  stdio: "inherit",
  cwd: root,
  shell: true,
  env: { ...process.env },
});
