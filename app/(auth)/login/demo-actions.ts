"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { setCounterDevice, unsetCounterDevice } from "@/lib/auth/counter";
import { usernameToEmail } from "@/lib/auth/username";
import { DEMO_ACCOUNTS, demoPassword, isDemoMode } from "@/lib/demo";

const roleSchema = z.enum(["worker", "admin"]);

/**
 * Demo only: one-click sign-in as the counter worker or the Admin.
 *
 * The worker also gets the signed counter cookie (check-in, payments, shifts);
 * the Admin gets the "remote admin" view, as on a real non-counter device.
 * Visitors share these accounts, so before signing in the account is restored
 * to its expected state (active, role, password) in case a visitor changed it.
 */
export async function demoSignInAction(
  rawRole: string,
): Promise<{ error: string }> {
  if (!isDemoMode()) {
    return { error: "Demo prijava nije dostupna." };
  }

  const parsed = roleSchema.safeParse(rawRole);
  const password = parsed.success ? demoPassword(parsed.data) : undefined;
  if (!parsed.success || !password) {
    return { error: "Demo prijava nije podešena." };
  }

  const role = parsed.data;
  const account = DEMO_ACCOUNTS[role];

  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("staff")
    .select("id")
    .eq("username", account.username)
    .maybeSingle();

  if (!staff) {
    return { error: "Demo nalog ne postoji." };
  }

  await admin
    .from("staff")
    .update({ active: true, role: account.role })
    .eq("id", staff.id);
  await admin.auth.admin.updateUserById(staff.id, { password });

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(account.username),
    password,
  });

  if (error) {
    console.error("[demoSignInAction]", error.message);
    return { error: "Demo prijava nije uspela. Pokušajte ponovo." };
  }

  if (role === "worker") {
    await setCounterDevice();
  } else {
    await unsetCounterDevice();
  }

  redirect("/");
}
