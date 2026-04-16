import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Returns a singleton Prisma client, or `null` if `DATABASE_URL` is unset
 * (avoids Prisma throwing at import time during local `next dev` without `.env`).
 */
export function getPrisma(): PrismaClient | null {
  if (!hasDatabaseUrl()) return null;
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}
