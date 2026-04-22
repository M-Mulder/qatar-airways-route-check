import { NextResponse } from "next/server";
import { fetchQr274BusinessCalendarMonth } from "@/lib/qr274Calendar";
import { getPrisma, hasDatabaseUrl } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 120;

type Payload = Awaited<ReturnType<typeof fetchQr274BusinessCalendarMonth>>;
type CacheEntry = { createdAtMs: number; payload: Payload };

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function hash01(s: string): number {
  // Deterministic, fast, good enough for mock data.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

function businessFullnessPct(params: { dateIso: string; avios: number | null }): number {
  const dt = new Date(`${params.dateIso}T12:00:00.000Z`);
  const dow = dt.getUTCDay(); // 0 Sun .. 6 Sat
  const jitter = (hash01(`qr274:${params.dateIso}`) - 0.5) * 10; // +/-5

  // Plausible seasonal pattern for May: weekends fuller, midweek lighter.
  let base = 62;
  if (dow === 5) base += 10; // Fri
  if (dow === 6) base += 14; // Sat
  if (dow === 0) base += 16; // Sun
  if (dow === 1) base += 6; // Mon
  if (dow === 2 || dow === 3) base -= 6; // Tue/Wed
  if (dow === 4) base -= 2; // Thu

  // Tie mock award tier to demand slightly.
  if (params.avios === 86000) base += 8;
  if (params.avios === 43000) base -= 3;

  return clampInt(base + jitter, 35, 98);
}

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

  const payload = await fetchQr274BusinessCalendarMonth({
    apiKey: key,
    monthIso: month,
    currency,
    adults: 1,
    concurrency: 3,
  });

  // Merge AVIOS from DB when available.
  try {
    if (hasDatabaseUrl()) {
      const prisma = getPrisma();
      if (prisma) {
        const from = new Date(`${month}-01T00:00:00.000Z`);
        const to = new Date(`${month}-31T23:59:59.999Z`);
        const rows = await prisma.awardPriceSnapshot.findMany({
          where: {
            flight: "QR274",
            origin: "AMS",
            destination: "DOH",
            cabin: "BUSINESS",
            program: "AVIOS",
            date: { gte: from, lte: to },
          },
          select: { date: true, avios: true },
        });
        const byDay = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r.avios] as const));
        for (const d of payload.prices) {
          d.avios = byDay.get(d.date) ?? null;
        }
      }
    }
  } catch {}

  // Mock Business cabin fullness (May-friendly pattern). API-level so it stays consistent on reload.
  for (const d of payload.prices) {
    (d as any).businessFullnessPct = businessFullnessPct({ dateIso: d.date, avios: (d as any).avios ?? null });
  }

  cache().set(cacheKey, { createdAtMs: Date.now(), payload });
  return NextResponse.json({ ok: true, cached: false, ...payload }, { status: 200 });
}

