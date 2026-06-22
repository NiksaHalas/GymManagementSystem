import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;

/** Latest today's membership payment for this member with no checkin_id. */
export async function findOrphanMembershipPaymentId(
  supabase: Client,
  memberId: string,
  businessDate: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("payment")
    .select("id")
    .eq("member_id", memberId)
    .eq("business_date", businessDate)
    .eq("kind", "membership")
    .eq("voided", false)
    .is("checkin_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

/** Latest today's check-in without a linked membership payment. */
export async function findOrphanCheckinId(
  supabase: Client,
  memberId: string,
  businessDate: string,
): Promise<string | null> {
  const { data: checkins, error } = await supabase
    .from("checkin")
    .select("id")
    .eq("member_id", memberId)
    .eq("business_date", businessDate)
    .eq("voided", false)
    .order("created_at", { ascending: false });

  if (error || !checkins?.length) return null;

  const checkinIds = checkins.map((c) => c.id);
  const { data: linked } = await supabase
    .from("payment")
    .select("checkin_id")
    .in("checkin_id", checkinIds)
    .eq("kind", "membership")
    .eq("voided", false);

  const linkedSet = new Set(
    (linked ?? []).map((p) => p.checkin_id).filter((id): id is string => id != null),
  );

  for (const c of checkins) {
    if (!linkedSet.has(c.id)) return c.id;
  }
  return null;
}

/** After a new check-in: link the most recent orphan membership payment (pay-first flow). */
export async function linkOrphanPaymentToCheckin(
  supabase: Client,
  memberId: string,
  checkinId: string,
  businessDate: string,
  staffId: string,
): Promise<void> {
  const paymentId = await findOrphanMembershipPaymentId(
    supabase,
    memberId,
    businessDate,
  );
  if (!paymentId) return;

  await supabase
    .from("payment")
    .update({ checkin_id: checkinId, updated_by: staffId })
    .eq("id", paymentId)
    .is("checkin_id", null);
}

/** Before record_payment: use explicit id, or auto-match an orphan check-in (check-in-first flow). */
export async function resolveCheckinIdForPayment(
  supabase: Client,
  memberId: string,
  explicitCheckinId: string | null | undefined,
  businessDate: string,
): Promise<string | null> {
  if (explicitCheckinId) return explicitCheckinId;
  return findOrphanCheckinId(supabase, memberId, businessDate);
}
