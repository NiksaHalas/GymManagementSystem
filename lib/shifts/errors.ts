import type { PostgrestError } from "@supabase/supabase-js";

const TRANSIENT_SQLSTATES = new Set([
  "08000",
  "08003",
  "08006",
  "08001",
  "08004",
  "08007",
  "08P01",
  "53300",
  "57014",
  "57P01",
  "57P02",
  "57P03",
  "40001",
  "40P01",
]);

function extractSqlState(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  const e = error as Record<string, unknown>;

  if (typeof e.code === "string" && /^\d{5}$/.test(e.code)) {
    return e.code;
  }

  const details = e.details;
  if (typeof details === "string") {
    const match = details.match(/SQLSTATE[:\s]+(\d{5})/i);
    if (match) return match[1];
  }

  const cause = e.cause;
  if (cause && typeof cause === "object") {
    const nested = extractSqlState(cause);
    if (nested) return nested;
  }

  return null;
}

/** Classify Supabase/Postgres errors for app-layer retry (not unique_violation — RPC handles that). */
export function isTransientSupabaseError(error: unknown): boolean {
  const sqlState = extractSqlState(error);
  if (sqlState) {
    if (sqlState === "23505") return false;
    if (TRANSIENT_SQLSTATES.has(sqlState)) return true;
    if (sqlState.startsWith("08")) return true;
  }

  const pg = error as PostgrestError & { status?: number } | null;
  if (pg?.status && pg.status >= 500) return true;

  return false;
}
