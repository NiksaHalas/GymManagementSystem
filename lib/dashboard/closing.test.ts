import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPastGymClosing } from "@/lib/dashboard/closing";

describe("isPastGymClosing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Wednesday 2026-09-23, 12:00 Belgrade (UTC+2)
    vi.setSystemTime(new Date("2026-09-23T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is always true for past business days", () => {
    expect(isPastGymClosing("2026-09-22")).toBe(true);
  });

  it("is false today before the 21:00 weekday close", () => {
    expect(isPastGymClosing("2026-09-23", Date.parse("2026-09-23T18:59:00Z"))).toBe(false);
  });

  it("is true today from the 21:00 weekday close", () => {
    expect(isPastGymClosing("2026-09-23", Date.parse("2026-09-23T19:00:00Z"))).toBe(true);
  });

  it("uses the earlier Saturday close", () => {
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
    expect(isPastGymClosing("2026-09-26", Date.parse("2026-09-26T15:59:00Z"))).toBe(false);
    expect(isPastGymClosing("2026-09-26", Date.parse("2026-09-26T16:00:00Z"))).toBe(true);
  });
});
