import { describe, expect, it } from "vitest";
import {
  formatDayHeader,
  formatHm,
  formatShiftDuration,
  formatWeekdayLong,
  formatWeekRangeLabel,
  gymCloseTime,
  shiftEndReasonLabel,
} from "@/lib/shifts/format";

describe("gymCloseTime", () => {
  it("closes at 21:00 on weekdays, 18:00 on Saturday, 16:00 on Sunday", () => {
    expect(gymCloseTime("2026-09-21")).toBe("21:00"); // Monday
    expect(gymCloseTime("2026-09-25")).toBe("21:00"); // Friday
    expect(gymCloseTime("2026-09-26")).toBe("18:00"); // Saturday
    expect(gymCloseTime("2026-09-27")).toBe("16:00"); // Sunday
  });
});

describe("formatShiftDuration", () => {
  it("formats minutes, whole hours and mixed durations", () => {
    expect(formatShiftDuration(45 * 60_000)).toBe("45m");
    expect(formatShiftDuration(2 * 3_600_000)).toBe("2č");
    expect(formatShiftDuration(2 * 3_600_000 + 5 * 60_000)).toBe("2č 5m");
  });

  it("drops partial minutes", () => {
    expect(formatShiftDuration(59_999)).toBe("0m");
  });
});

describe("formatHm", () => {
  it("renders Belgrade local time in 24h format across DST", () => {
    expect(formatHm("2026-09-21T15:05:00Z")).toBe("17:05");
    expect(formatHm("2026-01-21T15:05:00Z")).toBe("16:05");
  });
});

describe("weekday and week labels", () => {
  it("renders weekday names in Latin script", () => {
    expect(formatWeekdayLong("2026-09-21")).toBe("ponedeljak");
    expect(formatWeekdayLong("2026-09-27")).toBe("nedelja");
  });

  it("builds the day header and week range labels", () => {
    expect(formatDayHeader("2026-09-23")).toBe("sreda, 23.09.2026.");
    expect(formatWeekRangeLabel("2026-09-21")).toBe("21.09 – 27.09");
    expect(formatWeekRangeLabel("2026-12-28")).toBe("28.12 – 03.01");
  });
});

describe("shiftEndReasonLabel", () => {
  it("labels open shifts as in progress regardless of reason", () => {
    expect(shiftEndReasonLabel("logout", true).label).toBe("U toku");
  });

  it("maps each end reason to its label", () => {
    expect(shiftEndReasonLabel("logout", false).label).toBe("Završena ručno");
    expect(shiftEndReasonLabel("switch", false).label).toBe("Zamena radnika");
    expect(shiftEndReasonLabel("inactivity", false).label).toBe("Neaktivnost");
  });

  it("explains auto-closed shifts with a tooltip", () => {
    const l = shiftEndReasonLabel("auto_close", false);
    expect(l.label).toBe("Auto-zatvaranje");
    expect(l.tooltip).toBeDefined();
  });

  it("falls back to a dash for unknown reasons", () => {
    expect(shiftEndReasonLabel(null, false).label).toBe("—");
  });
});
