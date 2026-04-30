import { describe, expect, it } from "vitest";
import { parseFr24FlightHistoryFlexible } from "@/lib/fr24FlightHistory";
import { closeFr24Playwright, fetchFr24HtmlViaPlaywright } from "@/lib/fr24Playwright";

describe.skipIf(!process.env.RUN_FR24_PW)("FR24 Playwright integration", () => {
  it(
    "loads QR274 history HTML with rows",
    async () => {
      const html = await fetchFr24HtmlViaPlaywright("QR274");
      expect(html.length).toBeGreaterThan(2_000);
      const rows = parseFr24FlightHistoryFlexible(html);
      expect(rows.length).toBeGreaterThan(0);
      await closeFr24Playwright();
    },
    120_000,
  );
});
