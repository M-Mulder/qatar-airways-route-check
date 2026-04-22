import { NextResponse } from "next/server";
import { getPrisma, hasDatabaseUrl } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

type Payload = {
  monthIso: string;
  cabin: "BUSINESS";
  prices: Array<{
    date: string;
    currency: string;
    price: number | null;
    avios: number | null;
    businessFullnessPct: number | null;
  }>;
};
type CacheEntry = { createdAtMs: number; payload: Payload };

declare global {
  // eslint-disable-next-line no-var
  var __qr274CalendarCache: Map<string, CacheEntry> | undefined;
}

function cache(): Map<string, CacheEntry> {
  globalThis.__qr274CalendarCache ??= new Map();
  return globalThis.__qr274CalendarCache;
}

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = (searchParams.get("month") || "").trim();
  const currency = (searchParams.get("currency") || "EUR").trim().toUpperCase();
  const refresh = (searchParams.get("refresh") || "").trim() === "1";

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return jsonError(400, "Invalid month. Expected YYYY-MM (e.g. 2026-05).");
  }

  const ttlMs = 1000 * 60 * 60 * 6;
  const cacheKey = `${month}:${currency}`;
  const hit = refresh ? null : cache().get(cacheKey);
  if (!refresh && hit && Date.now() - hit.createdAtMs < ttlMs) {
    const payload: Payload = hit.payload;
    return NextResponse.json({ ok: true, cached: true, ...payload }, { status: 200 });
  }

  if (!hasDatabaseUrl()) {
    return jsonError(500, "DATABASE_URL not set (calendar reads from DB only).");
  }
  const prisma = getPrisma();
  if (!prisma) return jsonError(500, "Database client unavailable.");

  const from = new Date(`${month}-01T00:00:00.000Z`);
  const to = new Date(`${month}-31T23:59:59.999Z`);
  const snaps = await prisma.qr274CalendarDaySnapshot.findMany({
    where: { date: { gte: from, lte: to }, currency },
    orderBy: { date: "asc" },
    select: { date: true, currency: true, cashPrice: true, avios: true, businessFullnessPct: true },
  });
  if (snaps.length === 0) {
    return jsonError(404, "No calendar rows found in DB. Seed via /api/admin/seed-qr274-avios.");
  }

  const payload: Payload = {
    monthIso: month,
    cabin: "BUSINESS",
    prices: snaps.map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      currency: s.currency,
      price: s.cashPrice ?? null,
      avios: s.avios ?? null,
      businessFullnessPct: s.businessFullnessPct ?? null,
    })),
  };

  cache().set(cacheKey, { createdAtMs: Date.now(), payload });
  return NextResponse.json({ ok: true, cached: false, ...payload }, { status: 200 });
}

