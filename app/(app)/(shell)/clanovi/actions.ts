"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireUser, requireAdmin } from "@/lib/auth/session";
import { memberFormSchema } from "@/lib/members/schema";
import type { MemberFormValues } from "@/lib/members/schema";
import type { MemberSearchRow } from "@/lib/members/types";

const MEMBERS_PAGE_SIZE = 50;

const PHONE_TAKEN_ERROR = "Broj telefona već postoji kod drugog člana.";
const RESTORE_ADMIN_ONLY_ERROR = "Samo administrator može vratiti člana iz arhive.";
const ARCHIVE_DEBT_ERROR =
  "Član ima neizmirene rezervisane (dužne) termine. Izmirite ih pre arhiviranja.";

/** Maps pause/resume RPC errors (GYM03/GYM04 carry readable Serbian messages). */
function mapPauseError(error: { code?: string; message: string }): string {
  if (error.code === "GYM03" || error.code === "GYM04") {
    return error.message;
  }
  return error.message;
}

/** Maps DB constraint/trigger violations to readable messages; otherwise the raw error. */
function mapMemberWriteError(error: { code?: string; message: string }): string {
  if (error.code === "23505" || error.message.includes("member_phone_digits_uidx")) {
    return PHONE_TAKEN_ERROR;
  }
  if (error.code === "42501") {
    return RESTORE_ADMIN_ONLY_ERROR;
  }
  if (error.code === "23514" && error.message.includes("rezervisane")) {
    return ARCHIVE_DEBT_ERROR;
  }
  return error.message;
}

type ActionError = { ok: false; error: string };
type ActionOk<T> = { ok: true } & T;
type ActionResult = { ok: true } | ActionError;

export interface SearchMembersResult {
  rows: MemberSearchRow[];
  total: number;
  page: number;
  pageSize: number;
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

  if (error) return { ok: false, error: mapMemberWriteError(error) };

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

  if (error) return { ok: false, error: mapMemberWriteError(error) };

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

  if (error) return { ok: false, error: mapMemberWriteError(error) };

  revalidatePath("/clanovi");
  revalidatePath(`/clanovi/${id}`);
  return { ok: true };
}

/** Pauses an active membership (PRD §3.4). Any worker. */
export async function pauseMembership(
  membershipId: string,
  memberId: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await getClient();
  const { error } = await supabase.rpc("pause_membership", {
    p_membership_id: membershipId,
  });
  if (error) return { ok: false, error: mapPauseError(error) };
  revalidatePath("/clanovi");
  revalidatePath(`/clanovi/${memberId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Resumes a paused membership; extends end_date by elapsed paused days. */
export async function resumeMembership(
  membershipId: string,
  memberId: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await getClient();
  const { error } = await supabase.rpc("resume_membership", {
    p_membership_id: membershipId,
  });
  if (error) return { ok: false, error: mapPauseError(error) };
  revalidatePath("/clanovi");
  revalidatePath(`/clanovi/${memberId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Restores an archived member. Admin-only (app requireAdmin + DB trigger). */
export async function restoreMember(id: string): Promise<ActionResult> {
  const staff = await requireAdmin();
  const supabase = await getClient();

  const { error } = await supabase
    .from("member")
    .update({ archived: false, archived_at: null, updated_by: staff.id })
    .eq("id", id);

  if (error) return { ok: false, error: mapMemberWriteError(error) };

  revalidatePath("/clanovi");
  revalidatePath(`/clanovi/${id}`);
  return { ok: true };
}
