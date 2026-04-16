/**
 * Windows EPERM on `rename(...query_engine-windows.dll.node.tmp..., ...dll.node)` usually means
 * something locked `node_modules/.prisma/client` (legacy) or `.prisma-client` (custom output).
 * We remove those trees first (with retries / attrib on Windows), then run `prisma generate`.
 *
 * Usage: node scripts/prisma-generate-safe.mjs
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const legacyClientDir = join(root, "node_modules", ".prisma", "client");
const customClientDir = join(root, ".prisma-client");

async function sleepMs(ms) {
  if (process.platform === "win32") {
    const code = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", `Start-Sleep -Milliseconds ${ms}`],
      { stdio: "ignore", windowsHide: true },
    );
    if (code.status === 0) return;
  }
  await delay(ms);
}

function clearReadOnlyWindows(dir) {
  if (process.platform !== "win32" || !existsSync(dir)) return;
  try {
    execSync(`attrib -R "${dir}\\*.*" /S`, { stdio: "ignore", cwd: root, shell: true });
  } catch {
    /* ignore */
  }
}

async function removeDir(dir, { quiet } = { quiet: false }) {
  if (!existsSync(dir)) return;

  if (process.platform === "win32") {
    clearReadOnlyWindows(dir);
  }

  const warn = (msg, err) => {
    if (!quiet) console.warn(msg, err?.message || err);
  };

  const rmOpts = { recursive: true, force: true };
  try {
    rmSync(dir, { ...rmOpts, maxRetries: 12, retryDelay: 200 });
    return;
  } catch (e1) {
    warn("[prisma-generate-safe] rmSync with retries failed:", e1);
  }

  try {
    rmSync(dir, rmOpts);
    return;
  } catch (e2) {
    warn("[prisma-generate-safe] rmSync failed:", e2);
  }

  try {
    for (const name of readdirSync(dir)) {
      if (!name.includes("query_engine") && !name.endsWith(".node") && !name.endsWith(".dll")) continue;
      const p = join(dir, name);
      for (let i = 0; i < 10; i++) {
        try {
          unlinkSync(p);
          break;
        } catch {
          await sleepMs(250);
        }
      }
    }
    rmSync(dir, rmOpts);
  } catch (e3) {
    warn("[prisma-generate-safe] partial cleanup failed:", e3);
  }
}

async function main() {
  await removeDir(customClientDir, { quiet: false });
  await removeDir(legacyClientDir, { quiet: true });

  try {
    execSync("npx prisma generate", { stdio: "inherit", cwd: root, env: process.env, shell: true });
  } catch (e) {
    console.error(`
[prisma-generate-safe] prisma generate failed.

On Windows, stop anything using this repo’s Prisma engine, then retry:
  - Stop "next dev" / "next start" / vitest / any Node using this project
  - In Cursor: Command Palette → "TypeScript: Restart TS Server"
  - Then: npm run db:generate

The client is generated under .prisma-client at the repo root (not under src/) to reduce IDE file locks.
`);
    process.exit(e?.status ?? 1);
  }
}

await main();
