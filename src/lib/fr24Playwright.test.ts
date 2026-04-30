import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fr24PlaywrightFallbackEnabled } from "@/lib/fr24Playwright";

describe("fr24PlaywrightFallbackEnabled", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("FR24_PLAYWRIGHT", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to true when VERCEL=1 (Airfleets runs after FR24 browser is torn down)", () => {
    vi.stubEnv("VERCEL", "1");
    expect(fr24PlaywrightFallbackEnabled()).toBe(true);
  });

  it("defaults to true locally (no VERCEL) so laptops tolerate FR24 403 without Serper", () => {
    expect(fr24PlaywrightFallbackEnabled()).toBe(true);
  });

  it("still true on Vercel when FR24_PLAYWRIGHT is unset", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("FR24_PLAYWRIGHT", "");
    expect(fr24PlaywrightFallbackEnabled()).toBe(true);
  });

  it("forces false everywhere when FR24_PLAYWRIGHT=0", () => {
    vi.stubEnv("FR24_PLAYWRIGHT", "0");
    expect(fr24PlaywrightFallbackEnabled()).toBe(false);
    vi.stubEnv("VERCEL", "1");
    expect(fr24PlaywrightFallbackEnabled()).toBe(false);
  });
});
