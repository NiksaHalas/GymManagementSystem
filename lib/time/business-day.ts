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
