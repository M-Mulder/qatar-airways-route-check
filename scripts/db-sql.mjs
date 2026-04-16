import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDbEnv } from "./load-db-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const relSql = process.argv[2];
if (!relSql) {
  console.error("Usage: node scripts/db-sql.mjs <path-to.sql under repo>");
  process.exit(1);
}

const sqlPath = resolve(root, relSql);
if (!existsSync(sqlPath)) {
  console.error("SQL file not found:", sqlPath);
  process.exit(1);
}

loadDbEnv(root);
if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is not set (.env.local or .env).");
  process.exit(1);
}

const relFromRoot = relSql.replace(/\\/g, "/");
execSync(`npx prisma db execute --file "${relFromRoot}" --schema prisma/schema.prisma`, {
  stdio: "inherit",
  cwd: root,
  env: process.env,
  shell: true,
});
