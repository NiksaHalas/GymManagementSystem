import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { Staff } from "@/lib/db/types";

/**
 * Returns the currently authenticated Supabase user, or null.
 * Always uses getUser() (not getSession()) per Supabase security guidance.
 */
export async function getSessionUser() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/**
 * Returns the staff row for the currently authenticated user, or null.
 * Uses the server Supabase client so RLS is applied.
 */
export async function getCurrentStaff(): Promise<Staff | null> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("id", user.user.id)
    .single();

  if (error || !data) return null;
  return data as Staff;
}

/**
 * Asserts that a user is logged in and active.
 * Redirects to /login if not authenticated or if the account is disabled.
 * Returns the staff row on success.
 */
export async function requireUser(): Promise<Staff> {
  const staff = await getCurrentStaff();
  if (!staff) {
    redirect("/login");
  }
  if (!staff.active) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    await supabase.auth.signOut();
    redirect("/login?error=disabled");
  }
  return staff;
}

/**
 * Asserts that the current user is an active Admin.
 * Redirects to /login or the dashboard if not authorized.
 */
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireUser();
  if (staff.role !== "admin") {
    redirect("/");
  }
  return staff;
}
