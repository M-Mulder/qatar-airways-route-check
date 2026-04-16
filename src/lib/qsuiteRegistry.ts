import qsuiteRaw from "../../data/qsuite-tails.json";

export type QsuiteTail = {
  registration: string;
  aircraftType: string;
  note?: string;
};

const tails = qsuiteRaw as QsuiteTail[];

const set = new Map<string, QsuiteTail>();
for (const t of tails) {
  set.set(normalizeReg(t.registration), t);
}

export function normalizeReg(reg: string): string {
  return reg.trim().toUpperCase().replace(/\s+/g, "");
}

export function hasQsuiteTail(registration: string | null | undefined): boolean {
  if (!registration) return false;
  return set.has(normalizeReg(registration));
}

export function tailMeta(registration: string | null | undefined): QsuiteTail | undefined {
  if (!registration) return undefined;
  return set.get(normalizeReg(registration));
}

export function qsuiteTailCount(): number {
  return set.size;
}
