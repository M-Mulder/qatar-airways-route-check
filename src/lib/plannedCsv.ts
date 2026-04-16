export type PlannedRow = {
  query_date: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_local: string;
  vehicle_code: string;
  vehicle_name: string;
  vehicle_short: string;
  qsuite_equipped: boolean | null;
};

function parseBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return null;
}

/** Normalize Qatar CSV export to PlannedRow[]. */
export function parsePlannedCsv(csvText: string): PlannedRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const iq = idx("query_date");
  const ifn = idx("flight_number");
  const io = idx("origin");
  const id = idx("destination");
  const idep = idx("departure_local");
  const ivc = idx("vehicle_code");
  const ivn = idx("vehicle_name");
  const ivs = idx("vehicle_short");
  const iqs = idx("qsuite_equipped");
  if (iq < 0 || ifn < 0) return [];

  const out: PlannedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < header.length) continue;
    const get = (j: number) => (j >= 0 ? (cols[j] ?? "").trim() : "");
    out.push({
      query_date: get(iq),
      flight_number: get(ifn).toUpperCase().replace(/\s/g, ""),
      origin: get(io).toUpperCase(),
      destination: get(id).toUpperCase(),
      departure_local: get(idep),
      vehicle_code: get(ivc),
      vehicle_name: get(ivn),
      vehicle_short: get(ivs),
      qsuite_equipped: iqs >= 0 ? parseBool(get(iqs)) : null,
    });
  }
  return out;
}

/** RFC3339-ish date part of departure_local (first 10 chars). */
export function departureDateKey(departureLocal: string): string | null {
  if (!departureLocal || departureLocal.length < 10) return null;
  const d = departureLocal.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

function equipmentLabel(r: PlannedRow): string {
  const code = (r.vehicle_code || "").toUpperCase();
  const short = (r.vehicle_short || "").toUpperCase();
  const name = (r.vehicle_name || "").toUpperCase();
  if (code === "351" || name.includes("350-1000")) return "A350-1000";
  if (code === "359" || short === "A359" || name.includes("350-900")) return "A350-900";
  if (code === "77W" || short === "B773" || name.includes("777-300")) return "B77W";
  if (short) return short;
  if (code) return code;
  return (r.vehicle_name || "").trim() || "—";
}

/** Latest query_date wins when multiple rows match same operated day + segment. */
export function pickPlannedForSegment(
  rows: PlannedRow[],
  compareDate: string,
  flight: string,
  fromIata: string,
  toIata: string,
): PlannedRow | null {
  const matches = rows.filter((r) => {
    if (r.flight_number !== flight) return false;
    if (r.origin !== fromIata || r.destination !== toIata) return false;
    return departureDateKey(r.departure_local) === compareDate;
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => (a.query_date < b.query_date ? 1 : a.query_date > b.query_date ? -1 : 0));
  return matches[0] ?? null;
}

export function plannedEquipmentSummary(r: PlannedRow): string {
  return equipmentLabel(r);
}

/** Marketing-style full name for UI when CSV has no `vehicle_name`. */
const EQUIPMENT_CATEGORY_FULL_NAMES: Record<string, string> = {
  "A350-900": "Airbus A350-900",
  "A350-1000": "Airbus A350-1000",
  B77W: "Boeing 777-300ER",
};

/** Map stored compare summary (e.g. A350-900) to a readable aircraft name. */
export function plannedEquipmentDisplayFullName(category: string | null | undefined): string {
  const s = (category ?? "").trim();
  if (!s) return "—";
  return EQUIPMENT_CATEGORY_FULL_NAMES[s] ?? s;
}

/** Full aircraft name: prefer CSV `vehicle_name`, else derive from equipment category. */
export function aircraftDisplayFullName(r: PlannedRow): string {
  const vn = (r.vehicle_name || "").trim();
  if (vn) return vn;
  return plannedEquipmentDisplayFullName(plannedEquipmentSummary(r));
}

/**
 * Short type code for display (e.g. `a359`): prefer `vehicle_short`, else derive from `vehicle_code`.
 */
export function aircraftDisplayTypeCode(r: PlannedRow): string {
  const short = (r.vehicle_short || "").trim();
  if (short) return short.toLowerCase();
  const vc = (r.vehicle_code || "").trim();
  if (!vc) return "—";
  if (/^\d{3}$/.test(vc)) return `a${vc}`;
  return vc.toLowerCase();
}

/** Operational day (departure_local YYYY-MM-DD) for rows matching configured segments; max = latest day in export. */
export function pickLatestCompareDateFromPlannedRows(
  rows: PlannedRow[],
  segments: { flight: string; fromIata: string; toIata: string }[],
): string | null {
  const dates: string[] = [];
  for (const seg of segments) {
    for (const r of rows) {
      if (r.flight_number !== seg.flight) continue;
      if (r.origin !== seg.fromIata || r.destination !== seg.toIata) continue;
      const d = departureDateKey(r.departure_local);
      if (d) dates.push(d);
    }
  }
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}

/** Earliest operational day among CSV rows matching configured segments (ISO date). */
export function pickMinCompareDateFromPlannedRows(
  rows: PlannedRow[],
  segments: { flight: string; fromIata: string; toIata: string }[],
): string | null {
  const dates: string[] = [];
  for (const seg of segments) {
    for (const r of rows) {
      if (r.flight_number !== seg.flight) continue;
      if (r.origin !== seg.fromIata || r.destination !== seg.toIata) continue;
      const d = departureDateKey(r.departure_local);
      if (d) dates.push(d);
    }
  }
  if (dates.length === 0) return null;
  return dates.sort()[0] ?? null;
}

/** Minimal CSV line splitter (handles quoted fields without embedded newlines). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}
