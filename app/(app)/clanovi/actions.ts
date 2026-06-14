"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireUser, requireAdmin } from "@/lib/auth/session";
import { memberFormSchema, normalizePhone } from "@/lib/members/schema";
import type { MemberFormValues } from "@/lib/members/schema";
import type { MemberSearchRow } from "@/lib/members/types";

const MEMBERS_PAGE_SIZE = 50;

type ActionError = { ok: false; error: string };
type ActionOk<T> = { ok: true } & T;
type ActionResult = { ok: true } | ActionError;

export interface SearchMembersResult {
  rows: MemberSearchRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DuplicatePhoneMatch {
  id: string;
  member_no: number | null;
  first_name: string;
  last_name: string;
}

async function getClient() {
  const cookieStore = await cookies();
  return createClient(cookieStore);
}

/** Paginated browse (empty q) or fuzzy search via the search_members RPC. */
export async function searchMembers(
  q: string,
  options: { includeArchived?: boolean; page?: number } = {},
): Promise<SearchMembersResult> {
  await requireUser();
  const page = Math.max(0, options.page ?? 0);
  const includeArchived = options.includeArchived ?? false;
  const supabase = await getClient();

  const { data, error } = await supabase.rpc("search_members", {
    q: q ?? "",
    include_archived: includeArchived,
    lim: MEMBERS_PAGE_SIZE,
    off: page * MEMBERS_PAGE_SIZE,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as MemberSearchRow[];
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return { rows, total, page, pageSize: MEMBERS_PAGE_SIZE };
}

/** Returns active members sharing the same phone number (digit-normalized). */
export async function checkPhoneDuplicate(
  phone: string,
): Promise<DuplicatePhoneMatch[]> {
  await requireUser();
  const digits = normalizePhone(phone);
  if (digits.length < 3) return [];

  const supabase = await getClient();
  const { data, error } = await supabase
    .from("member")
    .select("id, member_no, first_name, last_name, phone")
    .eq("archived", false)
    .limit(50);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((m) => normalizePhone(m.phone) === digits)
    .map(({ id, member_no, first_name, last_name }) => ({
      id,
      member_no,
      first_name,
      last_name,
    }));
}

/** Creates a member, returning the new id. Sets audit columns to the acting staff (required by RLS). */
export async function createMember(
  values: MemberFormValues,
): Promise<ActionOk<{ id: string }> | ActionError> {
  const staff = await requireUser();

  const parsed = memberFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neispravni podaci." };
  }
  const v = parsed.data;

  const supabase = await getClient();
  const { data, error } = await supabase
    .from("member")
    .insert({
      first_name: v.first_name,
      last_name: v.last_name,
      phone: v.phone,
      discount_flag: v.discount_flag,
      comment: v.comment ? v.comment : null,
      created_by: staff.id,
      updated_by: staff.id,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clanovi");
  return { ok: true, id: data.id };
}

/** Updates a member's core fields. */
export async function updateMember(
  id: string,
  values: MemberFormValues,
): Promise<ActionResult> {
  const staff = await requireUser();

  const parsed = memberFormSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neispravni podaci." };
  }
  const v = parsed.data;

  const supabase = await getClient();
  const { error } = await supabase
    .from("member")
    .update({
      first_name: v.first_name,
      last_name: v.last_name,
      phone: v.phone,
      discount_flag: v.discount_flag,
      comment: v.comment ? v.comment : null,
      updated_by: staff.id,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clanovi");
  revalidatePath(`/clanovi/${id}`);
  return { ok: true };
}

/** Quick-toggle of the family/school discount flag (any worker). */
export async function toggleDiscount(
  id: string,
  value: boolean,
): Promise<ActionResult> {
  const staff = await requireUser();
  const supabase = await getClient();
  const { error } = await supabase
    .from("member")
    .update({ discount_flag: value, updated_by: staff.id })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clanovi/${id}`);
  return { ok: true };
}

/** Quick-save of the member comment (special needs). */
export async function updateComment(
  id: string,
  comment: string,
): Promise<ActionResult> {
  const staff = await requireUser();
  const trimmed = comment.trim();
  const supabase = await getClient();
  const { error } = await supabase
    .from("member")
    .update({ comment: trimmed ? trimmed : null, updated_by: staff.id })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clanovi/${id}`);
  return { ok: true };
}

/** Soft-deletes (archives) a member; blocked while unsettled owed sessions exist (PRD 3.5). */
export async function archiveMember(id: string): Promise<ActionResult> {
  const staff = await requireUser();
  const supabase = await getClient();

  const { count, error: countError } = await supabase
    .from("reserved_session")
    .select("id", { count: "exact", head: true })
    .eq("member_id", id)
    .eq("settled", false);

  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error:
        "Član ima neizmirene rezervisane (dužne) termine. Izmirite ih pre arhiviranja.",
    };
  }

  const { error } = await supabase
    .from("member")
    .update({
      archived: true,
      archived_at: new Date().toISOString(),
      updated_by: staff.id,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clanovi");
  revalidatePath(`/clanovi/${id}`);
  return { ok: true };
}

/** Restores an archived member. Admin-only (enforced at app level). */
export async function restoreMember(id: string): Promise<ActionResult> {
  const staff = await requireAdmin();
  const supabase = await getClient();

  const { error } = await supabase
    .from("member")
    .update({ archived: false, archived_at: null, updated_by: staff.id })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/clanovi");
  revalidatePath(`/clanovi/${id}`);
  return { ok: true };
}
