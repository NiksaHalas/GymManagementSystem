"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { normalizeUsername, usernameToEmail } from "@/lib/auth/username";

const MAX_ATTEMPTS = 5;
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
 * Derive a rate-limit key from the username + client IP.
 * IP is extracted from the forwarded header (works on Vercel/proxied setups).
 */
async function getRateLimitKey(username: string): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  return `login:${username}:${ip}`;
}

/**
 * Check and update login attempt count using Supabase (admin client, bypasses RLS).
 * We store attempt counters in a simple in-memory approach won't work serverlessly,
 * so we use Supabase DB: the `login_attempt` table (created below via migration).
 * Returns true if the account/IP is locked out.
 */
async function checkRateLimit(key: string): Promise<boolean> {
  const admin = createAdminClient();

  const windowStart = new Date(
    Date.now() - LOCKOUT_WINDOW_SECONDS * 1000,
  ).toISOString();

  const { count } = await admin
    .from("login_attempt")
    .select("*", { count: "exact", head: true })
    .eq("attempt_key", key)
    .gte("attempted_at", windowStart);

  return (count ?? 0) >= MAX_ATTEMPTS;
}

async function recordAttempt(key: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("login_attempt")
    .insert({ attempt_key: key, attempted_at: new Date().toISOString() });
}

async function clearAttempts(key: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("login_attempt").delete().eq("attempt_key", key);
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

  const rateLimitKey = await getRateLimitKey(username);
  const locked = await checkRateLimit(rateLimitKey);
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
    await recordAttempt(rateLimitKey);
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
  await clearAttempts(rateLimitKey);

  const destination = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";
  redirect(destination);
}
