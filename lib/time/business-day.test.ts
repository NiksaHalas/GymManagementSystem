import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  belgradeDayOf,
  belgradeInstant,
  businessToday,
  daysBetween,
  weekStartMonday,
} from "@/lib/time/business-day";

describe("businessToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rolls over at Belgrade midnight in winter (UTC+1)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T22:59:00Z"));
    expect(businessToday()).toBe("2026-03-10");
    vi.setSystemTime(new Date("2026-03-10T23:00:00Z"));
    expect(businessToday()).toBe("2026-03-11");
  });

  it("rolls over at Belgrade midnight in summer (UTC+2)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T21:59:00Z"));
    expect(businessToday()).toBe("2026-07-01");
    vi.setSystemTime(new Date("2026-07-01T22:00:00Z"));
    expect(businessToday()).toBe("2026-07-02");
  });
});

describe("daysBetween", () => {
  it("counts whole days, positive into the future", () => {
    expect(daysBetween("2026-09-23", "2026-09-26")).toBe(3);
    expect(daysBetween("2026-09-26", "2026-09-23")).toBe(-3);
    expect(daysBetween("2026-09-23", "2026-09-23")).toBe(0);
  });

  it("is not skewed by the DST switch", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("returns NaN for malformed input", () => {
    expect(daysBetween("not-a-date", "2026-09-23")).toBeNaN();
  });
});

describe("addDays", () => {
  it("crosses month, year and leap-year boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("supports negative offsets", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("weekStartMonday", () => {
  it("returns the ISO Monday of the week", () => {
    expect(weekStartMonday("2026-09-21")).toBe("2026-09-21"); // Monday
    expect(weekStartMonday("2026-09-23")).toBe("2026-09-21"); // Wednesday
    expect(weekStartMonday("2026-09-27")).toBe("2026-09-21"); // Sunday
  });
});

describe("belgradeDayOf", () => {
  it("maps late-evening UTC instants to the next Belgrade day", () => {
    expect(belgradeDayOf("2026-09-23T21:30:00Z")).toBe("2026-09-23");
    expect(belgradeDayOf("2026-09-23T22:30:00Z")).toBe("2026-09-24");
  });
});

describe("belgradeInstant", () => {
  it("uses UTC+1 before and UTC+2 after the March switch", () => {
    expect(belgradeInstant("2026-03-28", "12:00").toISOString()).toBe(
      "2026-03-28T11:00:00.000Z",
    );
    expect(belgradeInstant("2026-03-29", "12:00").toISOString()).toBe(
      "2026-03-29T10:00:00.000Z",
    );
  });

  it("uses UTC+2 before and UTC+1 after the October switch", () => {
    expect(belgradeInstant("2026-10-24", "21:00").toISOString()).toBe(
      "2026-10-24T19:00:00.000Z",
    );
    expect(belgradeInstant("2026-10-25", "21:00").toISOString()).toBe(
      "2026-10-25T20:00:00.000Z",
    );
  });
});
