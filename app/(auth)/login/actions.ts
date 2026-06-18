"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import {
  buildRateLimitKeys,
  clearRateLimitAttempts,
  isRateLimited,
  rateLimitLockoutMessage,
  recordRateLimitAttempt,
} from "@/lib/auth/rate-limit";
import {
  normalizeUsername,
  usernameToEmail,
  validateUsername,
} from "@/lib/auth/username";

const GENERIC_AUTH_ERROR = "Neispravno korisničko ime ili lozinka.";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  callbackUrl: z.string().optional(),
});

export type LoginActionResult = {
  error?: string;
  fieldErrors?: { username?: string; password?: string };
};

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

  const usernameError = validateUsername(username);
  if (usernameError) {
    return { fieldErrors: { username: usernameError } };
  }

  const email = usernameToEmail(username);

  const rateLimitKeys = await buildRateLimitKeys("login", username);
  if (await isRateLimited(rateLimitKeys)) {
    return { error: rateLimitLockoutMessage() };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await recordRateLimitAttempt(rateLimitKeys);
    return { error: GENERIC_AUTH_ERROR };
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("active")
    .eq("id", data.user.id)
    .single();

  if (!staff?.active) {
    await supabase.auth.signOut();
    return { error: GENERIC_AUTH_ERROR };
  }

  await clearRateLimitAttempts(rateLimitKeys);

  const destination =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/";
  redirect(destination);
}
