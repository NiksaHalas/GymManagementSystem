import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { createClient } from "@/utils/supabase/server";
import type { Staff } from "@/lib/db/types";

/**
 * Returns the currently authenticated user, validated with Supabase Auth.
 * Wrapped in React.cache() so layout + page share one getUser() per render.
 * Middleware also calls getUser() once per HTTP request to refresh cookies.
 */
export const getSessionUser = cache(async () => {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
});

/**
 * Returns the staff row for the currently authenticated user, or null.
 * Cached per request — safe to call from layout and page in the same render.
 */
export const getCurrentStaff = cache(async (): Promise<Staff | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data as Staff;
});

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
