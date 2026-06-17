"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { isCounterDevice } from "@/lib/auth/counter";
import { businessToday } from "@/lib/time/business-day";
import {
  editPaymentSchema,
  recordPaymentSchema,
  voidPaymentSchema,
} from "@/lib/pazar/schema";
import { fetchPaymentContext } from "@/lib/pazar/queries";
import { fetchPaymentCatalog } from "@/lib/pazar/catalog";

type ActionError = { ok: false; error: string };
type ActionOk<T = undefined> = T extends undefined
  ? { ok: true }
  : { ok: true } & T;
type ActionResult = ActionOk | ActionError;

async function getClient() {
  const cookieStore = await cookies();
  return createClient(cookieStore);
}

async function requireCounterToday(): Promise<
  ActionError | { ok: true; staffId: string }
> {
  const staff = await requireUser();
  if (!(await isCounterDevice())) {
    return { ok: false, error: "Operacije su dostupne samo na šalteru." };
  }
  return { ok: true, staffId: staff.id };
}

function revalidatePaymentPaths(memberId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/pazar");
  if (memberId) revalidatePath(`/clanovi/${memberId}`);
}

export async function getPaymentContextAction(memberId: string) {
  await requireUser();
  return fetchPaymentContext(memberId);
}

export async function getPaymentCatalogAction() {
  await requireUser();
  return fetchPaymentCatalog();
}

export async function recordPayment(
  input: unknown,
): Promise<ActionOk<{ paymentId: string; scheduled: boolean }> | ActionError> {
  const guard = await requireCounterToday();
  if (!guard.ok) return guard;

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Neispravan unos.",
    };
  }

  const ctx = await fetchPaymentContext(parsed.data.memberId);
  if (!ctx) return { ok: false, error: "Član nije pronađen." };

  const hadActive = ctx.hasActiveMembership;
  const supabase = await getClient();

  const { data, error } = await supabase.rpc("record_payment", {
    p_member_id: parsed.data.memberId,
    p_membership_type_id: parsed.data.membershipTypeId,
    p_amount_rsd: parsed.data.amountRsd,
    p_is_custom_price: parsed.data.isCustomPrice,
    p_custom_reason: parsed.data.customReason,
    p_start_mode: parsed.data.startMode,
    p_settle_reserved_ids: parsed.data.settleReservedIds,
    p_checkin_id: parsed.data.checkinId,
    p_business_date: businessToday(),
  });

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Uplata nije kreirana." };

  const scheduled =
    hadActive && parsed.data.membershipTypeId !== null;

  revalidatePaymentPaths(parsed.data.memberId);
  return {
    ok: true,
    paymentId: data as string,
    scheduled,
  };
}

export async function voidPayment(input: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = voidPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Neispravan unos.",
    };
  }

  const supabase = await getClient();
  const { data: payment } = await supabase
    .from("payment")
    .select("member_id")
    .eq("id", parsed.data.paymentId)
    .maybeSingle();

  const { error } = await supabase.rpc("void_payment", {
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePaymentPaths(payment?.member_id ?? undefined);
  return { ok: true };
}

export async function editPayment(input: unknown): Promise<ActionResult> {
  const staff = await requireUser();
  const parsed = editPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Neispravan unos.",
    };
  }

  const supabase = await getClient();
  const { data: existing } = await supabase
    .from("payment")
    .select("kind, member_id, membership_type_id, voided")
    .eq("id", parsed.data.paymentId)
    .maybeSingle();

  if (!existing || existing.voided) {
    return { ok: false, error: "Uplata nije pronađena." };
  }
  if (existing.kind !== "membership") {
    return { ok: false, error: "Izmena je dozvoljena samo za članarinu." };
  }

  const { error } = await supabase
    .from("payment")
    .update({
      amount_rsd: parsed.data.amountRsd,
      custom_reason: parsed.data.customReason,
      is_custom_price: true,
      updated_by: staff.id,
    })
    .eq("id", parsed.data.paymentId);

  if (error) return { ok: false, error: error.message };

  revalidatePaymentPaths(existing.member_id ?? undefined);
  return { ok: true };
}
