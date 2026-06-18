import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/utils/supabase/admin";

/** Per (username + IP): blocks a single guessing source. */
export const MAX_ATTEMPTS = 5;
/** Per username across all IPs: defeats IP rotation (higher threshold). */
export const MAX_ATTEMPTS_USERNAME = 20;
/** Lockout window in seconds */
export const LOCKOUT_WINDOW_SECONDS = 15 * 60;

export type RateLimitPrefix = "login" | "reset" | "switch";

export type RateLimitKeys = {
  ipKey: string;
  usernameKey: string;
};

/**
 * Derive the two rate-limit keys for an attempt:
 * - ipKey (`<prefix>:<username>:<ip>`) blocks a single source.
 * - usernameKey (`<prefix>-uname:<username>`) blocks distributed guessing.
 */
export async function buildRateLimitKeys(
  prefix: RateLimitPrefix,
  username: string,
): Promise<RateLimitKeys> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  return {
    ipKey: `${prefix}:${username}:${ip}`,
    usernameKey: `${prefix}-uname:${username}`,
  };
}

async function countAttempts(key: string): Promise<number> {
  const admin = createAdminClient();
  const windowStart = new Date(
    Date.now() - LOCKOUT_WINDOW_SECONDS * 1000,
  ).toISOString();

  const { count } = await admin
    .from("login_attempt")
    .select("*", { count: "exact", head: true })
    .eq("attempt_key", key)
    .gte("attempted_at", windowStart);

  return count ?? 0;
}

/** True if either the per-(username+IP) or the per-username threshold is exceeded. */
export async function isRateLimited(keys: RateLimitKeys): Promise<boolean> {
  const [ipCount, usernameCount] = await Promise.all([
    countAttempts(keys.ipKey),
    countAttempts(keys.usernameKey),
  ]);
  return ipCount >= MAX_ATTEMPTS || usernameCount >= MAX_ATTEMPTS_USERNAME;
}

export async function recordRateLimitAttempt(
  keys: RateLimitKeys,
): Promise<void> {
  const admin = createAdminClient();
  const attempted_at = new Date().toISOString();
  await admin.from("login_attempt").insert([
    { attempt_key: keys.ipKey, attempted_at },
    { attempt_key: keys.usernameKey, attempted_at },
  ]);
}

export async function clearRateLimitAttempts(
  keys: RateLimitKeys,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("login_attempt")
    .delete()
    .in("attempt_key", [keys.ipKey, keys.usernameKey]);
}

export function rateLimitLockoutMessage(): string {
  return `Previše neuspešnih pokušaja. Sačekajte ${LOCKOUT_WINDOW_SECONDS / 60} minuta.`;
}
