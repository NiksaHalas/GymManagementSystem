const BELGRADE_TZ = "Europe/Belgrade";

/**
 * Returns today's business date in Europe/Belgrade as an ISO `YYYY-MM-DD` string.
 * Mirrors the SQL `business_today()` helper so client/server day logic agrees.
 */
export function businessToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Whole days from `fromIso` to `toIso` (both `YYYY-MM-DD`). Positive when `toIso`
 * is in the future. Computed at UTC midnight to avoid DST/offset drift.
 */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

/** Calendar date shift by N days (UTC midnight math on `YYYY-MM-DD`). */
export function addDays(iso: string, n: number): string {
  const d = Date.parse(`${iso}T00:00:00Z`);
  return new Date(d + n * 86_400_000).toISOString().slice(0, 10);
}

/** Monday (ISO) of the week that contains `iso`. */
export function weekStartMonday(iso: string): string {
  const d = Date.parse(`${iso}T00:00:00Z`);
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d + diff * 86_400_000).toISOString().slice(0, 10);
}

/** Belgrade calendar date for a UTC instant. */
export function belgradeDayOf(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * UTC instant for a Belgrade local date + `HH:MM` (handles DST via iterative correction).
 */
export function belgradeInstant(dateIso: string, hm: string): Date {
  const want = `${dateIso}T${hm}:00`;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const [y, mo, d] = dateIso.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  let ms = Date.UTC(y, mo - 1, d, h, mi);

  for (let i = 0; i < 5; i++) {
    const parts = formatter.formatToParts(new Date(ms));
    const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const got = `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}:00`;
    if (got === want) return new Date(ms);
    const wantMs = Date.parse(`${want}Z`);
    const gotMs = Date.parse(`${got}Z`);
    ms += wantMs - gotMs;
  }

  return new Date(ms);
}
