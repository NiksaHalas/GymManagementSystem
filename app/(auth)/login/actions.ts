"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { normalizeUsername, usernameToEmail } from "@/lib/auth/username";

/** Per (username + IP): blocks a single guessing source. */
const MAX_ATTEMPTS = 5;
/** Per username across all IPs: defeats IP rotation (higher threshold). */
const MAX_ATTEMPTS_USERNAME = 20;
/** Lockout window in seconds */
const LOCKOUT_WINDOW_SECONDS = 15 * 60;

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  callbackUrl: z.string().optional(),
});

export type LoginActionResult = {
  error?: string;
  fieldErrors?: { username?: string; password?: string };
};

/**
 * Derive the two rate-limit keys for a login attempt:
 * - ipKey (`login:<username>:<ip>`) blocks a single guessing source (5/15min).
 * - usernameKey (`login-uname:<username>`) blocks distributed guessing against one
 *   account regardless of IP (20/15min), defeating IP rotation.
 * IP is extracted from the forwarded header (works on Vercel/proxied setups).
 */
async function getRateLimitKeys(
  username: string,
): Promise<{ ipKey: string; usernameKey: string }> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  return { ipKey: `login:${username}:${ip}`, usernameKey: `login-uname:${username}` };
}

/**
 * Returns the number of failed attempts for a key within the sliding window.
 * Uses the admin client (bypasses RLS); attempts live in the `login_attempt` table.
 */
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
async function isLockedOut(keys: {
  ipKey: string;
  usernameKey: string;
}): Promise<boolean> {
  const [ipCount, usernameCount] = await Promise.all([
    countAttempts(keys.ipKey),
    countAttempts(keys.usernameKey),
  ]);
  return ipCount >= MAX_ATTEMPTS || usernameCount >= MAX_ATTEMPTS_USERNAME;
}

async function recordAttempt(keys: {
  ipKey: string;
  usernameKey: string;
}): Promise<void> {
  const admin = createAdminClient();
  const attempted_at = new Date().toISOString();
  await admin.from("login_attempt").insert([
    { attempt_key: keys.ipKey, attempted_at },
    { attempt_key: keys.usernameKey, attempted_at },
  ]);
}

async function clearAttempts(keys: {
  ipKey: string;
  usernameKey: string;
}): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("login_attempt")
    .delete()
    .in("attempt_key", [keys.ipKey, keys.usernameKey]);
}

export async function signInAction(
  formData: FormData,
): Promise<LoginActionResult> {
  const raw = {
    username: formData.get("username"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl"),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Popunite sva polja." };
  }

  const { username: rawUsername, password, callbackUrl } = parsed.data;
  const username = normalizeUsername(rawUsername);
  const email = usernameToEmail(username);

  const rateLimitKeys = await getRateLimitKeys(username);
  const locked = await isLockedOut(rateLimitKeys);
  if (locked) {
    return {
      error: `Previše neuspešnih pokušaja. Sačekajte ${LOCKOUT_WINDOW_SECONDS / 60} minuta.`,
    };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await recordAttempt(rateLimitKeys);
    return { error: "Neispravno korisničko ime ili lozinka." };
  }

  // Check if account is active in staff table
  const { data: staff } = await supabase
    .from("staff")
    .select("active")
    .eq("id", data.user.id)
    .single();

  if (!staff?.active) {
    await supabase.auth.signOut();
    return { error: "Ovaj nalog je deaktiviran. Kontaktirajte administratora." };
  }

  // Clear failed attempts on successful login
  await clearAttempts(rateLimitKeys);

  const destination = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";
  redirect(destination);
}
