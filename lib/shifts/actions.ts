"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCurrentStaff } from "@/lib/auth/session";
import { usernameToEmail } from "@/lib/auth/username";
import type { Shift } from "@/lib/db/types";

/**
 * Fetch the currently open shift for a given staff member.
 * "Open" means ended_at IS NULL.
 */
async function getOpenShift(staffId: string): Promise<Shift | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase
    .from("shift")
    .select("*")
    .eq("staff_id", staffId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Shift | null) ?? null;
}

/**
 * Fetch any open shift on the counter (regardless of worker).
 * Used during login to detect if a handover is needed.
 */
async function getAnyOpenShift(): Promise<Shift | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase
    .from("shift")
    .select("*")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Shift | null) ?? null;
}

/**
 * Open a new shift for a staff member (set started_at = now()).
 */
async function openShift(staffId: string): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase.from("shift").insert({
    staff_id: staffId,
    started_at: new Date().toISOString(),
  });
}

/**
 * Close an existing shift by ID.
 */
async function closeShift(
  shiftId: string,
  reason: Shift["ended_reason"],
): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase
    .from("shift")
    .update({
      ended_at: new Date().toISOString(),
      ended_reason: reason,
    })
    .eq("id", shiftId);
}

/**
 * Ensure an open shift exists for the given staff member on the counter device.
 * - If no open shift exists: open one.
 * - If an open shift belongs to a DIFFERENT worker: close it (switch) and open a new one.
 * - If the same worker already has an open shift: do nothing (idempotent).
 * Called from the (app) layout on every counter request.
 */
export async function ensureOpenShift(staffId: string): Promise<void> {
  const anyOpen = await getAnyOpenShift();

  if (!anyOpen) {
    // No open shift at all: open one for this worker
    await openShift(staffId);
    return;
  }

  if (anyOpen.staff_id === staffId) {
    // Same worker already has an open shift — nothing to do
    return;
  }

  // A different worker has an open shift: this is a login-time handover
  await closeShift(anyOpen.id, "switch");
  await openShift(staffId);
}

/**
 * Server action: manually end the current worker's shift.
 * Shift ends with ended_reason='logout'. The Supabase auth session is NOT touched.
 */
export async function endShiftAction(): Promise<void> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const open = await getOpenShift(staff.id);
  if (open) {
    await closeShift(open.id, "logout");
  }

  revalidatePath("/", "layout");
}

/**
 * Server action: switch worker on the counter.
 * Authenticates the incoming worker by username + password, closes the current
 * shift as 'switch', signs in the new worker, and opens a new shift.
 *
 * Returns an error string or null on success (for client-side handling).
 */
export async function switchWorkerAction(
  username: string,
  password: string,
): Promise<{ error: string | null }> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const email = usernameToEmail(username.trim().toLowerCase());
  const { data: authData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !authData.user) {
    return { error: "Neispravno korisničko ime ili lozinka." };
  }

  // Check the new worker is active in staff table
  const { data: newStaff } = await supabase
    .from("staff")
    .select("id, active")
    .eq("id", authData.user.id)
    .single();

  if (!newStaff?.active) {
    // Sign back out — this account is disabled
    await supabase.auth.signOut();
    return { error: "Nalog je deaktiviran." };
  }

  // Close any open shift
  const open = await getAnyOpenShift();
  if (open) {
    await closeShift(open.id, "switch");
  }

  // Open a shift for the incoming worker
  await openShift(newStaff.id);
  revalidatePath("/", "layout");

  return { error: null };
}

/**
 * Server action: sign out the current user.
 * Does NOT close the open shift (per product decision — shift stays open
 * until manually ended or auto-closed by pg_cron).
 */
export async function signOutAction(): Promise<void> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase.auth.signOut();
  redirect("/login");
}
