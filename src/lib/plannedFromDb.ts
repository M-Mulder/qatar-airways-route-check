import type { PlannedSegment } from "@/generated/prisma";
import { getPrisma } from "@/lib/prisma";
import type { PlannedRow } from "@/lib/plannedCsv";

export function plannedSegmentToRow(s: PlannedSegment): PlannedRow {
  return {
    query_date: s.queryDate,
    flight_number: s.flightNumber,
    origin: s.origin,
    destination: s.destination,
    departure_local: s.departureLocal,
    vehicle_code: s.vehicleCode,
    vehicle_name: s.vehicleName,
    vehicle_short: s.vehicleShort,
    qsuite_equipped: s.qsuiteEquipped,
  };
}

export async function loadPlannedRowsFromDatabase(): Promise<PlannedRow[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  try {
    const rows = await prisma.plannedSegment.findMany({
      orderBy: [{ departureLocal: "asc" }, { flightId: "asc" }],
    });
    return rows.map(plannedSegmentToRow);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("undefined") && msg.includes("findMany")) {
      throw new Error(
        "PlannedSegment model is missing from the Prisma client. Run: npx prisma generate (then apply DB migrations if needed).",
      );
    }
    throw e;
  }
}
