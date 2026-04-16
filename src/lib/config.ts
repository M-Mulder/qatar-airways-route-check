export type SegmentDef = {
  flight: string;
  routeKey: string;
  fromIata: string;
  toIata: string;
};

/** Legs we compare (must match FR24 row FROM/TO airports). */
export const DEFAULT_SEGMENTS: SegmentDef[] = [
  { flight: "QR274", routeKey: "AMS-DOH", fromIata: "AMS", toIata: "DOH" },
  { flight: "QR284", routeKey: "AMS-DOH", fromIata: "AMS", toIata: "DOH" },
  { flight: "QR934", routeKey: "DOH-MNL", fromIata: "DOH", toIata: "MNL" },
];

export function getSegmentsFromEnv(): SegmentDef[] {
  const raw = process.env.COMPARE_FLIGHTS?.trim();
  if (!raw) return DEFAULT_SEGMENTS;
  const flights = raw.split(",").map((s) => s.trim().toUpperCase());
  return DEFAULT_SEGMENTS.filter((s) => flights.includes(s.flight));
}

export function fr24FlightPath(flight: string): string {
  return `https://www.flightradar24.com/data/flights/${flight.toLowerCase()}`;
}
