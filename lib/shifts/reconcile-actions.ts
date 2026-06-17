"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { requireAdmin } from "@/lib/auth/session";

async function assertAdmin() {
  return requireAdmin();
}

export async function assignShiftToCheckin(
  checkinId: string,
  shiftId: string,
): Promise<{ error: string | null }> {
  await assertAdmin();

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("checkin")
    .update({ shift_id: shiftId })
    .eq("id", checkinId)
    .is("shift_id", null)
    .is("waived_at", null);

  if (error) {
    console.error("[assignShiftToCheckin]", error.message);
    return { error: "Greška pri dodeli smene." };
  }

  revalidatePath("/dashboard");
  return { error: null };
}

export async function assignShiftToPayment(
  paymentId: string,
  shiftId: string,
): Promise<{ error: string | null }> {
  await assertAdmin();

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("payment")
    .update({ shift_id: shiftId })
    .eq("id", paymentId)
    .is("shift_id", null)
    .is("waived_at", null);

  if (error) {
    console.error("[assignShiftToPayment]", error.message);
    return { error: "Greška pri dodeli smene." };
  }

  revalidatePath("/pazar");
  return { error: null };
}

export async function waiveCheckinAttribution(
  checkinId: string,
): Promise<{ error: string | null }> {
  const staff = await assertAdmin();
  const supabase = await getServerSupabase();

  const { error } = await supabase
    .from("checkin")
    .update({
      waived_at: new Date().toISOString(),
      waived_by: staff.id,
    })
    .eq("id", checkinId)
    .is("shift_id", null)
    .is("waived_at", null);

  if (error) {
    console.error("[waiveCheckinAttribution]", error.message);
    return { error: "Greška pri označavanju." };
  }

  revalidatePath("/dashboard");
  return { error: null };
}

export async function waivePaymentAttribution(
  paymentId: string,
): Promise<{ error: string | null }> {
  const staff = await assertAdmin();
  const supabase = await getServerSupabase();

  const { error } = await supabase
    .from("payment")
    .update({
      waived_at: new Date().toISOString(),
      waived_by: staff.id,
    })
    .eq("id", paymentId)
    .is("shift_id", null)
    .is("waived_at", null);

  if (error) {
    console.error("[waivePaymentAttribution]", error.message);
    return { error: "Greška pri označavanju." };
  }

  revalidatePath("/pazar");
  return { error: null };
}
