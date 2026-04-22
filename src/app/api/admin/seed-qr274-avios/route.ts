import { NextResponse } from "next/server";
import { getPrisma, hasDatabaseUrl } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function monthIsoNext(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function daysInMonthIso(monthIso: string): string[] {
  const [yS, mS] = monthIso.split("-");
  const y = parseInt(yS || "", 10);
  const m = parseInt(mS || "", 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return [];
  const start = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  const out: string[] = [];
  for (let dt = new Date(start); dt.getUTCMonth() === start.getUTCMonth(); dt.setUTCDate(dt.getUTCDate() + 1)) {
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

function mockAvios(dateIso: string): number {
  // Deterministic 60/40 split: mostly 43k, sometimes 86k.
  return hash01(`avios:${dateIso}`) < 0.6 ? 43000 : 86000;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function businessFullnessPct(params: { dateIso: string; avios: number | null }): number {
  const dt = new Date(`${params.dateIso}T12:00:00.000Z`);
  const dow = dt.getUTCDay(); // 0 Sun .. 6 Sat
  const jitter = (hash01(`qr274:${params.dateIso}`) - 0.5) * 10; // +/-5

  let base = 62;
  if (dow === 5) base += 10; // Fri
  if (dow === 6) base += 14; // Sat
  if (dow === 0) base += 16; // Sun
  if (dow === 1) base += 6; // Mon
  if (dow === 2 || dow === 3) base -= 6; // Tue/Wed
  if (dow === 4) base -= 2; // Thu

  if (params.avios === 86000) base += 8;
  if (params.avios === 43000) base -= 3;

  return clampInt(base + jitter, 35, 98);
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return jsonError(500, "CRON_SECRET not set");
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) return jsonError(401, "Unauthorized");

  if (!hasDatabaseUrl()) return jsonError(500, "DATABASE_URL not set");
  const prisma = getPrisma();
  if (!prisma) return jsonError(500, "Database client unavailable");

  const { searchParams } = new URL(req.url);
  const month = (searchParams.get("month") || monthIsoNext()).trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return jsonError(400, "Invalid month. Expected YYYY-MM.");

  const days = daysInMonthIso(month);
  if (days.length === 0) return jsonError(400, "No days for given month");

  const currency = (searchParams.get("currency") || "EUR").trim().toUpperCase();

  const flight = "QR274";
  const origin = "AMS";
  const destination = "DOH";
  const cabin = "BUSINESS";
  const program = "AVIOS";

  let upserts = 0;
  for (const iso of days) {
    const date = new Date(`${iso}T12:00:00.000Z`);
    const avios = mockAvios(iso);
    const fullness = businessFullnessPct({ dateIso: iso, avios });
    await prisma.awardPriceSnapshot.upsert({
      where: { flight_origin_destination_cabin_date_program: { flight, origin, destination, cabin, date, program } },
      create: { flight, origin, destination, cabin, date, program, avios },
      update: { avios, observedAt: new Date() },
    });
    await prisma.qr274CalendarDaySnapshot.upsert({
      where: { date_currency: { date, currency } },
      create: { date, currency, cashPrice: null, avios, businessFullnessPct: fullness },
      update: { observedAt: new Date(), avios, businessFullnessPct: fullness },
    });
    upserts++;
  }

  return NextResponse.json({ ok: true, month, upserts }, { status: 200 });
}

