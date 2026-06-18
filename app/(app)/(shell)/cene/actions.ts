"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  upsertPriceSchema,
  createMembershipTypeSchema,
  toggleMembershipTypeActiveSchema,
  toggleTrainingCategoryActiveSchema,
  type UpsertPriceInput,
  type CreateMembershipTypeInput,
} from "@/lib/catalog/schema";
import { slugifyCategoryCode } from "@/lib/catalog/format";

type ActionError = { ok: false; error: string };
type ActionOk = { ok: true };

async function getClient() {
  const cookieStore = await cookies();
  return createClient(cookieStore);
}

async function getCategoryCode(
  supabase: Awaited<ReturnType<typeof getClient>>,
  categoryId: number,
): Promise<string | null> {
  const { data } = await supabase
    .from("training_category")
    .select("code")
    .eq("id", categoryId)
    .maybeSingle();
  return data?.code ?? null;
}

async function assertOtvoreniDiscount(
  supabase: Awaited<ReturnType<typeof getClient>>,
  membershipTypeId: number,
  isDiscount: boolean,
): Promise<string | null> {
  if (!isDiscount) return null;
  const { data: mt } = await supabase
    .from("membership_type")
    .select("training_category_id, training_category(code)")
    .eq("id", membershipTypeId)
    .maybeSingle();
  const code = (mt?.training_category as unknown as { code: string } | null)?.code;
  if (code !== "otvoreni") {
    return "Cena sa popustom je dozvoljena samo za Otvoreni tip.";
  }
  return null;
}

export async function upsertPrice(
  input: UpsertPriceInput,
): Promise<ActionOk | ActionError> {
  const staff = await requireAdmin();
  const parsed = upsertPriceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neispravan unos." };
  }

  const supabase = await getClient();
  const { membership_type_id, is_discount_price, amount_rsd } = parsed.data;

  const discountErr = await assertOtvoreniDiscount(
    supabase,
    membership_type_id,
    is_discount_price,
  );
  if (discountErr) return { ok: false, error: discountErr };

  const { data: existing } = await supabase
    .from("price")
    .select("id")
    .eq("membership_type_id", membership_type_id)
    .eq("is_discount_price", is_discount_price)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("price")
      .update({
        amount_rsd,
        active: true,
        updated_by: staff.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("price").insert({
      membership_type_id,
      amount_rsd,
      is_discount_price,
      active: true,
      updated_by: staff.id,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/cene");
  return { ok: true };
}

export async function createMembershipType(
  input: CreateMembershipTypeInput,
): Promise<ActionOk | ActionError> {
  const staff = await requireAdmin();
  const parsed = createMembershipTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neispravan unos." };
  }

  const supabase = await getClient();
  let categoryId = parsed.data.training_category_id ?? null;

  if (parsed.data.new_category) {
    const nc = parsed.data.new_category;
    const code = slugifyCategoryCode(nc.label);
    if (code === "") {
      return {
        ok: false,
        error: "Naziv kategorije mora sadržati slova ili brojeve.",
      };
    }

    const { data: existingCat } = await supabase
      .from("training_category")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (existingCat) {
      return { ok: false, error: "Kategorija sa ovim nazivom već postoji." };
    }

    const { data: maxSort } = await supabase
      .from("training_category")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: cat, error: catErr } = await supabase
      .from("training_category")
      .insert({
        code,
        label: nc.label,
        is_trainer_based: nc.is_trainer_based,
        per_trainee: nc.per_trainee,
        sort_order: (maxSort?.sort_order ?? 0) + 1,
        updated_by: staff.id,
      })
      .select("id, code")
      .single();

    if (catErr) {
      // Backstop the pre-check against a concurrent insert (unique_violation).
      if (catErr.code === "23505") {
        return { ok: false, error: "Kategorija sa ovim nazivom već postoji." };
      }
      return { ok: false, error: catErr.message };
    }
    categoryId = cat.id;
  }

  if (categoryId == null) {
    return { ok: false, error: "Kategorija nije izabrana." };
  }

  const categoryCode = await getCategoryCode(supabase, categoryId);
  if (
    parsed.data.discount_price_rsd != null &&
    categoryCode !== "otvoreni"
  ) {
    return { ok: false, error: "Cena sa popustom je dozvoljena samo za Otvoreni tip." };
  }

  const { data: mt, error: mtErr } = await supabase
    .from("membership_type")
    .insert({
      training_category_id: categoryId,
      package: parsed.data.package,
      label: parsed.data.label,
      is_time_based: parsed.data.is_time_based,
      sessions: parsed.data.is_time_based ? null : parsed.data.sessions,
      active: true,
    })
    .select("id")
    .single();

  if (mtErr) return { ok: false, error: mtErr.message };

  const { error: stdErr } = await supabase.from("price").insert({
    membership_type_id: mt.id,
    amount_rsd: parsed.data.standard_price_rsd,
    is_discount_price: false,
    active: true,
    updated_by: staff.id,
  });
  if (stdErr) return { ok: false, error: stdErr.message };

  if (parsed.data.discount_price_rsd != null) {
    const { error: discErr } = await supabase.from("price").insert({
      membership_type_id: mt.id,
      amount_rsd: parsed.data.discount_price_rsd,
      is_discount_price: true,
      active: true,
      updated_by: staff.id,
    });
    if (discErr) return { ok: false, error: discErr.message };
  }

  revalidatePath("/cene");
  return { ok: true };
}

export async function toggleMembershipTypeActive(input: {
  id: number;
  active: boolean;
}): Promise<ActionOk | ActionError> {
  await requireAdmin();
  const parsed = toggleMembershipTypeActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neispravan unos." };
  }

  const supabase = await getClient();
  const { error } = await supabase
    .from("membership_type")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/cene");
  return { ok: true };
}

export async function toggleTrainingCategoryActive(input: {
  id: number;
  active: boolean;
}): Promise<ActionOk | ActionError> {
  const staff = await requireAdmin();
  const parsed = toggleTrainingCategoryActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neispravan unos." };
  }

  const supabase = await getClient();
  const { error } = await supabase
    .from("training_category")
    .update({
      active: parsed.data.active,
      updated_by: staff.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/cene");
  return { ok: true };
}
