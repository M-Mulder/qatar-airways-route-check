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

  it("defaults to false when VERCEL=1 so production cron skips fragile headless Chromium for FR24", () => {
    vi.stubEnv("VERCEL", "1");
    expect(fr24PlaywrightFallbackEnabled()).toBe(false);
  });

  it("defaults to true locally (no VERCEL) so laptops can tolerate FR24 403 without Serper", () => {
    expect(fr24PlaywrightFallbackEnabled()).toBe(true);
  });

  it("forces true on Vercel when FR24_PLAYWRIGHT=1", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("FR24_PLAYWRIGHT", "1");
    expect(fr24PlaywrightFallbackEnabled()).toBe(true);
  });

  it("forces false everywhere when FR24_PLAYWRIGHT=0", () => {
    vi.stubEnv("FR24_PLAYWRIGHT", "0");
    expect(fr24PlaywrightFallbackEnabled()).toBe(false);
    vi.stubEnv("VERCEL", "1");
    expect(fr24PlaywrightFallbackEnabled()).toBe(false);
  });
});
