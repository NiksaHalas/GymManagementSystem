/** Must match migration 20260617100700_shift_attribution.sql launch timestamp. */
export const DEFAULT_SHIFT_ATTRIBUTION_LAUNCH_AT = "2026-06-17T10:07:00.000Z";

/** ISO timestamp: pending badge counts rows with created_at >= this value. */
export function getShiftAttributionLaunchAt(): string {
  const env = process.env.SHIFT_ATTRIBUTION_LAUNCH_AT?.trim();
  if (env) return env;
  return DEFAULT_SHIFT_ATTRIBUTION_LAUNCH_AT;
}
