import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaUrl?: string };

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Returns a singleton Prisma client, or `null` if `DATABASE_URL` is unset
 * (avoids Prisma throwing at import time during local `next dev` without `.env`).
 *
 * Passes `datasources.db.url` explicitly so queries work under Turbopack, where
 * Prisma's default `env("DATABASE_URL")` resolution can fail with "Environment variable not found".
 */
export function getPrisma(): PrismaClient | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    globalForPrisma.prisma = undefined;
    globalForPrisma.prismaUrl = undefined;
    return null;
  }
  if (globalForPrisma.prisma && globalForPrisma.prismaUrl !== url) {
    void globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url } },
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
    globalForPrisma.prismaUrl = url;
  }
  return globalForPrisma.prisma;
}
