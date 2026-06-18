"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { isCounterDevice } from "@/lib/auth/counter";
import { businessToday } from "@/lib/time/business-day";
import {
  checkinIdSchema,
  fitpassCheckinSchema,
  memberCheckinSchema,
  updateCheckinKeySchema,
} from "@/lib/dashboard/schema";
import type { CheckinMemberContext } from "@/lib/dashboard/types";
import {
  fetchCheckinMemberContext,
  countOpenKeysToday,
} from "@/lib/dashboard/queries";
import { searchMembers } from "@/app/(app)/(shell)/clanovi/actions";

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
  await requireUser();
  if (!(await isCounterDevice())) {
    return { ok: false, error: "Operacije su dostupne samo na šalteru." };
  }
  return { ok: true, staffId: (await requireUser()).id };
}

function revalidateDashboard() {
  revalidatePath("/dashboard");
}

export async function searchMembersForCheckin(q: string) {
  const guard = await requireCounterToday();
  if (!guard.ok) throw new Error(guard.error);
  return searchMembers(q, { includeArchived: false, page: 0 });
}

export async function getMemberCheckinContext(
  memberId: string,
): Promise<CheckinMemberContext | null> {
  const guard = await requireCounterToday();
  if (!guard.ok) throw new Error(guard.error);
  return fetchCheckinMemberContext(memberId);
}

export async function createMemberCheckin(
  input: unknown,
): Promise<ActionOk<{ id: string; reserved: boolean }> | ActionError> {
  const guard = await requireCounterToday();
  if (!guard.ok) return guard;

  const parsed = memberCheckinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neispravan unos." };
  }

  const { memberId, keyNo, withTrainer, trainingCategoryId, trainerId } = parsed.data;

  if (withTrainer && (!trainingCategoryId || !trainerId)) {
    return { ok: false, error: "Trener sesija zahteva kategoriju i trenera." };
  }

  const ctx = await fetchCheckinMemberContext(memberId);
  if (!ctx) return { ok: false, error: "Član nije pronađen." };

  if (withTrainer && !ctx.isTrainerBased) {
    return { ok: false, error: "Član nema trener-based članarinu." };
  }

  if (keyNo === null) {
    const open = await countOpenKeysToday();
    if (open >= 22) {
      // allowed with warning — client shows warning before submit
    }
  }

  const supabase = await getClient();
  const { data, error } = await supabase.rpc("create_checkin", {
    p_member_id: memberId,
    p_key_no: keyNo,
    p_with_trainer: withTrainer,
    p_training_category_id: withTrainer ? trainingCategoryId : null,
    p_trainer_id: withTrainer ? trainerId : null,
    p_is_fitpass: false,
    p_is_group_fitpass: false,
    p_business_date: businessToday(),
  });

  if (error) return { ok: false, error: error.message };

  const reserved =
    withTrainer &&
    (ctx.sessionsLeft ?? 0) <= 0 &&
    ctx.isTrainerBased;

  revalidateDashboard();
  return { ok: true, id: data as string, reserved };
}

export async function createFitpassCheckin(
  input: unknown,
): Promise<ActionOk<{ id: string }> | ActionError> {
  const guard = await requireCounterToday();
  if (!guard.ok) return guard;

  const parsed = fitpassCheckinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neispravan unos." };
  }

  const supabase = await getClient();
  const { data, error } = await supabase.rpc("create_checkin", {
    p_member_id: null,
    p_key_no: parsed.data.keyNo,
    p_with_trainer: false,
    p_training_category_id: null,
    p_trainer_id: null,
    p_is_fitpass: true,
    p_is_group_fitpass: parsed.data.isGroupFitpass,
    p_business_date: businessToday(),
  });

  if (error) return { ok: false, error: error.message };

  revalidateDashboard();
  return { ok: true, id: data as string };
}

export async function markLeft(
  input: unknown,
): Promise<ActionResult> {
  const guard = await requireCounterToday();
  if (!guard.ok) return guard;

  const parsed = checkinIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Neispravan dolazak." };
  }

  const supabase = await getClient();
  const { error } = await supabase
    .from("checkin")
    .update({
      key_returned: true,
      checked_out_at: new Date().toISOString(),
      updated_by: guard.staffId,
    })
    .eq("id", parsed.data.checkinId)
    .eq("business_date", businessToday())
    .eq("voided", false);

  if (error) return { ok: false, error: error.message };

  revalidateDashboard();
  return { ok: true };
}

export async function updateCheckinKey(
  input: unknown,
): Promise<ActionResult> {
  const guard = await requireCounterToday();
  if (!guard.ok) return guard;

  const parsed = updateCheckinKeySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neispravan unos." };
  }

  const supabase = await getClient();
  const { error } = await supabase
    .from("checkin")
    .update({
      key_no: parsed.data.keyNo,
      updated_by: guard.staffId,
    })
    .eq("id", parsed.data.checkinId)
    .eq("business_date", businessToday())
    .eq("voided", false);

  if (error) return { ok: false, error: error.message };

  revalidateDashboard();
  return { ok: true };
}

export async function voidCheckin(
  input: unknown,
): Promise<ActionResult> {
  const guard = await requireCounterToday();
  if (!guard.ok) return guard;

  const parsed = checkinIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Neispravan dolazak." };
  }

  const supabase = await getClient();
  const { error } = await supabase.rpc("void_checkin", {
    p_checkin_id: parsed.data.checkinId,
  });

  if (error) return { ok: false, error: error.message };

  revalidateDashboard();
  return { ok: true };
}
