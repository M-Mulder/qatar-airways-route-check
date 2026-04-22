import { NextResponse } from "next/server";
import { fetchQr274BusinessCalendarMonth } from "@/lib/qr274Calendar";
import { getPrisma, hasDatabaseUrl } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

type Payload = Awaited<ReturnType<typeof fetchQr274BusinessCalendarMonth>>;
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
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) return jsonError(500, "SERPAPI_KEY not set (required for live calendar prices).");

  const { searchParams } = new URL(req.url);
  const month = (searchParams.get("month") || "").trim();
  const currency = (searchParams.get("currency") || "EUR").trim().toUpperCase();
  const refresh = (searchParams.get("refresh") || "").trim() === "1";
  const preferDb = (searchParams.get("preferDb") || "1").trim() !== "0";

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return jsonError(400, "Invalid month. Expected YYYY-MM (e.g. 2026-05).");
  }

  const ttlMs = 1000 * 60 * 60 * 6;
  const cacheKey = `${month}:${currency}:preferDb=${preferDb ? "1" : "0"}`;
  const hit = refresh ? null : cache().get(cacheKey);
  if (!refresh && hit && Date.now() - hit.createdAtMs < ttlMs) {
    const payload: Payload = hit.payload;
    return NextResponse.json({ ok: true, cached: true, ...payload }, { status: 200 });
  }

  // Prefer DB snapshots when present (Vercel-friendly: renders without hitting SerpAPI).
  if (preferDb && hasDatabaseUrl()) {
    const prisma = getPrisma();
    if (prisma) {
      const from = new Date(`${month}-01T00:00:00.000Z`);
      const to = new Date(`${month}-31T23:59:59.999Z`);
      const snaps = await prisma.qr274CalendarDaySnapshot.findMany({
        where: { date: { gte: from, lte: to }, currency },
        orderBy: { date: "asc" },
        select: { date: true, currency: true, cashPrice: true, avios: true, businessFullnessPct: true },
      });
      if (snaps.length >= 14) {
        const payload: Payload = {
          monthIso: month,
          cabin: "BUSINESS",
          prices: snaps.map((s) => ({
            date: s.date.toISOString().slice(0, 10),
            currency: s.currency,
            price: s.cashPrice ?? null,
            avios: s.avios ?? null,
            source: s.cashPrice == null ? "missing" : "airline_direct",
            serpSearchId: null,
            error: null,
            businessFullnessPct: s.businessFullnessPct ?? null,
          })) as any,
        };
        cache().set(cacheKey, { createdAtMs: Date.now(), payload });
        return NextResponse.json({ ok: true, cached: false, fromDb: true, ...payload }, { status: 200 });
      }
    }
  }

  const payload = await fetchQr274BusinessCalendarMonth({
    apiKey: key,
    monthIso: month,
    currency,
    adults: 1,
    concurrency: 3,
  });

  // If we have DB snapshots, merge them into the live fetch (keeps AVIOS/fullness stable).
  try {
    if (hasDatabaseUrl()) {
      const prisma = getPrisma();
      if (prisma) {
        const from = new Date(`${month}-01T00:00:00.000Z`);
        const to = new Date(`${month}-31T23:59:59.999Z`);
        const snaps = await prisma.qr274CalendarDaySnapshot.findMany({
          where: { date: { gte: from, lte: to }, currency },
          select: { date: true, avios: true, businessFullnessPct: true },
        });
        const byDay = new Map(
          snaps.map((r) => [r.date.toISOString().slice(0, 10), { avios: r.avios, fullness: r.businessFullnessPct }] as const),
        );
        for (const d of payload.prices as any[]) {
          const hit = byDay.get(d.date);
          if (hit) {
            d.avios = hit.avios ?? d.avios ?? null;
            d.businessFullnessPct = hit.fullness ?? d.businessFullnessPct ?? null;
          }
        }
      }
    }
  } catch {}

  cache().set(cacheKey, { createdAtMs: Date.now(), payload });
  return NextResponse.json({ ok: true, cached: false, ...payload }, { status: 200 });
}

