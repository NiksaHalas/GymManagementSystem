"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isCounterDevice } from "@/lib/auth/counter";
import { getCurrentStaff } from "@/lib/auth/session";
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
import { isTransientSupabaseError } from "@/lib/shifts/errors";

const COUNTER_REQUIRED_MSG =
  "Ova akcija je dostupna samo na registrovanom šalteru.";

const MAX_OPEN_RETRIES = 2;
const RETRY_BACKOFF_MS = 300;

export type ShiftOpenResult =
  | { status: "ok" }
  | { status: "foreign_shift_open" }
  | { status: "error"; transient: boolean; message: string };

function mapOpenRpcResult(
  value: string | null,
  error: { message: string } | null,
): ShiftOpenResult {
  if (!error && value === "opened") return { status: "ok" };
  if (!error && value === "resumed") return { status: "ok" };
  if (!error && value === "foreign_shift_open") {
    return { status: "foreign_shift_open" };
  }

  if (error) {
    return {
      status: "error",
      transient: isTransientSupabaseError(error),
      message: error.message,
    };
  }

  return {
    status: "error",
    transient: false,
    message: "Neočekivan odgovor pri otvaranju smene.",
  };
}

async function callOpenOrResumeShift(): Promise<ShiftOpenResult> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase.rpc("open_or_resume_shift");

  return mapOpenRpcResult(data, error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Open or resume the caller's shift on the counter device (fail-open).
 * Retries 1–2 times on transient errors only; unique_violation is handled in RPC.
 */
export async function openOrResumeShift(): Promise<ShiftOpenResult> {
  if (!(await isCounterDevice())) {
    return { status: "ok" };
  }

  let last: ShiftOpenResult = {
    status: "error",
    transient: false,
    message: "Greška pri otvaranju smene.",
  };

  for (let attempt = 0; attempt <= MAX_OPEN_RETRIES; attempt++) {
    last = await callOpenOrResumeShift();
    if (last.status !== "error" || !last.transient) {
      return last;
    }
    if (attempt < MAX_OPEN_RETRIES) {
      await sleep(RETRY_BACKOFF_MS * (attempt + 1));
    }
  }

  console.error("[openOrResumeShift]", last);
  return last;
}

/**
 * Server action: atomically take over the open shift (counter device only).
 */
export async function handoverShiftAction(): Promise<{ error: string | null }> {
  if (!(await isCounterDevice())) {
    return { error: COUNTER_REQUIRED_MSG };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.rpc("handover_shift");

  if (error) {
    console.error("[handoverShiftAction]", error.message);
    return { error: "Greška pri preuzimanju smene." };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

/**
 * Server action: manually end the current worker's shift.
 */
export async function endShiftAction(): Promise<void> {
  if (!(await isCounterDevice())) {
    throw new Error(COUNTER_REQUIRED_MSG);
  }

  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.rpc("end_shift");

  if (error) {
    console.error("[endShiftAction]", error.message);
    throw new Error("Greška pri završetku smene.");
  }

  revalidatePath("/", "layout");
}

/**
 * Server action: end the current worker's shift AND sign out in one step.
 * Combined (vs. two client calls) so no layout re-render can auto-reopen a shift
 * between ending it and signing out. No revalidatePath — we redirect anyway.
 */
export async function endShiftAndSignOutAction(): Promise<void> {
  if (!(await isCounterDevice())) {
    throw new Error(COUNTER_REQUIRED_MSG);
  }

  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.rpc("end_shift");
  if (error) {
    console.error("[endShiftAndSignOutAction]", error.message);
    throw new Error("Greška pri završetku smene.");
  }

  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Server action: switch worker — sign in incoming worker, then handover_shift only.
 */
const GENERIC_AUTH_ERROR = "Neispravno korisničko ime ili lozinka.";

export async function switchWorkerAction(
  username: string,
  password: string,
): Promise<{ error: string | null }> {
  if (!(await isCounterDevice())) {
    return { error: COUNTER_REQUIRED_MSG };
  }

  const normalized = normalizeUsername(username);
  const usernameError = validateUsername(normalized);
  if (usernameError) {
    return { error: GENERIC_AUTH_ERROR };
  }

  const rateLimitKeys = await buildRateLimitKeys("switch", normalized);
  if (await isRateLimited(rateLimitKeys)) {
    return { error: rateLimitLockoutMessage() };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const email = usernameToEmail(normalized);
  const { data: authData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !authData.user) {
    await recordRateLimitAttempt(rateLimitKeys);
    return { error: GENERIC_AUTH_ERROR };
  }

  const { data: newStaff } = await supabase
    .from("staff")
    .select("id, active")
    .eq("id", authData.user.id)
    .single();

  if (!newStaff?.active) {
    await supabase.auth.signOut();
    return { error: GENERIC_AUTH_ERROR };
  }

  await clearRateLimitAttempts(rateLimitKeys);

  const { error: shiftError } = await supabase.rpc("handover_shift");

  if (shiftError) {
    console.error("[switchWorkerAction]", shiftError.message);
    return { error: "Greška pri otvaranju smene." };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

/** @deprecated Use openOrResumeShift — kept for gradual migration if referenced elsewhere. */
export async function ensureOpenShift(): Promise<void> {
  await openOrResumeShift();
}

export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase.auth.signOut();
  redirect("/login");
}

/** Returns true if the current worker has an open shift (counter logout prompt). */
export async function hasOpenShiftAction(): Promise<boolean> {
  if (!(await isCounterDevice())) {
    return false;
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase.rpc("has_open_shift");

  if (error) {
    console.error("[hasOpenShiftAction]", error.message);
    return false;
  }

  return data === true;
}
