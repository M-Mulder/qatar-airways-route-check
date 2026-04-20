import type { PrismaClient } from "@/generated/prisma";

/**
 * Site-wide alert: latest BUSINESS snapshot matched the tracked flights but suite markers are missing
 * from the SerpAPI payload (NL: “Individuele suite”, EN: “Individual suite” in `extensions`, or “Qsuite” text).
 */
export async function getQsuitePriceAlertState(prisma: PrismaClient): Promise<{
  active: boolean;
  observedAt: Date | null;
}> {
  const row = await prisma.trackedBundlePriceSnapshot.findFirst({
    where: { cabin: "BUSINESS", matchedBundle: true },
    orderBy: { observedAt: "desc" },
    select: { qsuiteIndicatorsPresent: true, observedAt: true },
  });
  if (!row) return { active: false, observedAt: null };
  if (row.qsuiteIndicatorsPresent === false) {
    return { active: true, observedAt: row.observedAt };
  }
  return { active: false, observedAt: null };
}
