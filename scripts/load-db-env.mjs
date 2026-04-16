import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Load `.env` then `.env.local` (local overrides). Same idea as Next.js.
 * @param {string} projectRoot - qatar-airways-route-check repo root
 */
export function loadDbEnv(projectRoot) {
  /**
   * @param {string} rel
   * @param {boolean} override
   */
  function loadEnvFile(rel, override) {
    const p = join(projectRoot, rel);
    if (!existsSync(p)) return;
    const text = readFileSync(p, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (!override && process.env[key] !== undefined) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      val = val.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
      process.env[key] = val;
    }
  }

  loadEnvFile(".env", false);
  loadEnvFile(".env.local", true);
}
