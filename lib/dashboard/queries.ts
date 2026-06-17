import "server-only";

import { getServerSupabase } from "@/lib/supabase/server-client";
import { getMemberStatus } from "@/lib/members/status";
import { businessToday, daysBetween } from "@/lib/time/business-day";
import { SOON_TO_EXPIRE_DAYS } from "@/lib/members/status";
import type { MembershipSummary } from "@/lib/members/types";
import type {
  CheckinMemberContext,
  DashboardCheckinRow,
  DayStats,
  KeyHolder,
  SoonExpireMember,
  StaffOption,
} from "@/lib/dashboard/types";
import { KEY_COUNT } from "@/lib/dashboard/types";
import { getShiftAttributionLaunchAt } from "@/lib/shifts/config";

async function getClient() {
  return getServerSupabase();
}

/** Supabase embeds may return object or single-element array depending on relation. */
function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type RawCheckin = {
  id: string;
  created_at: string;
  business_date: string;
  shift_id: string | null;
  waived_at: string | null;
  key_no: number | null;
  key_returned: boolean;
  checked_out_at: string | null;
  is_fitpass: boolean;
  is_group_fitpass: boolean;
  with_trainer: boolean;
  decremented_session: boolean;
  member_id: string | null;
  member: {
    member_no: number | null;
    first_name: string;
    last_name: string;
    comment: string | null;
    discount_flag: boolean;
  } | null;
  membership: {
    status: string;
    end_date: string | null;
    sessions_left: number | null;
    membership_type: {
      label: string;
      is_time_based: boolean;
    } | null;
  } | null;
  training_category: { label: string } | null;
  trainer_id: string | null;
};

export async function fetchDayCheckins(
  businessDate: string,
  options?: { unassignedOnly?: boolean },
): Promise<DashboardCheckinRow[]> {
  const supabase = await getClient();
  const today = businessToday();
  const launchAt = getShiftAttributionLaunchAt();

  let query = supabase
    .from("checkin")
    .select(
      `
      id,
      created_at,
      business_date,
      shift_id,
      waived_at,
      key_no,
      key_returned,
      checked_out_at,
      is_fitpass,
      is_group_fitpass,
      with_trainer,
      decremented_session,
      member_id,
      member (
        member_no,
        first_name,
        last_name,
        comment,
        discount_flag
      ),
      membership (
        status,
        end_date,
        sessions_left,
        membership_type (
          label,
          is_time_based
        )
      ),
      training_category ( label ),
      trainer_id
    `,
    )
    .eq("business_date", businessDate)
    .eq("voided", false);

  if (options?.unassignedOnly) {
    query = query
      .is("shift_id", null)
      .is("waived_at", null)
      .gte("created_at", launchAt);
  }

  const { data: checkins, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) throw new Error(error.message);

  const rawCheckins = (checkins ?? []) as unknown as RawCheckin[];
  const checkinIds = rawCheckins.map((c) => c.id);

  const reservedCheckinIds = new Set<string>();
  if (checkinIds.length > 0) {
    const { data: reserved } = await supabase
      .from("reserved_session")
      .select("checkin_id")
      .in("checkin_id", checkinIds)
      .eq("settled", false);
    for (const r of reserved ?? []) {
      if (r.checkin_id) reservedCheckinIds.add(r.checkin_id);
    }
  }

  const trainerIds = [
    ...new Set(rawCheckins.map((c) => c.trainer_id).filter(Boolean)),
  ] as string[];
  const trainerMap = new Map<string, string>();
  if (trainerIds.length > 0) {
    const { data: trainers } = await supabase
      .from("staff")
      .select("id, username")
      .in("id", trainerIds);
    for (const t of trainers ?? []) {
      trainerMap.set(t.id, t.username);
    }
  }

  const memberIds = [
    ...new Set(
      (checkins ?? [])
        .map((c) => c.member_id)
        .filter((id): id is string => id != null),
    ),
  ];

  const paymentsByMember = new Map<
    string,
    { amount_rsd: number; kind: string; membership_type: { label: string } | null }
  >();

  if (memberIds.length > 0) {
    const { data: payments } = await supabase
      .from("payment")
      .select("member_id, amount_rsd, kind, membership_type ( label )")
      .eq("business_date", businessDate)
      .eq("voided", false)
      .in("member_id", memberIds);

    for (const p of payments ?? []) {
      if (p.member_id && !paymentsByMember.has(p.member_id)) {
        const mt = p.membership_type as unknown as { label: string } | null;
        paymentsByMember.set(p.member_id, {
          amount_rsd: p.amount_rsd,
          kind: p.kind,
          membership_type: mt,
        });
      }
    }
  }

  return rawCheckins.map((c) => {
    const summary: MembershipSummary | null = c.membership
      ? {
          status: c.membership.status as MembershipSummary["status"],
          endDate: c.membership.end_date,
          sessionsLeft: c.membership.sessions_left,
          isTimeBased: c.membership.membership_type?.is_time_based ?? null,
        }
      : null;

    const status = getMemberStatus(summary, today);
    const payment = c.member_id ? paymentsByMember.get(c.member_id) : undefined;

    return {
      id: c.id,
      createdAt: c.created_at,
      businessDate: c.business_date,
      keyNo: c.key_no,
      keyReturned: c.key_returned,
      checkedOutAt: c.checked_out_at,
      isFitpass: c.is_fitpass,
      isGroupFitpass: c.is_group_fitpass,
      withTrainer: c.with_trainer,
      decrementedSession: c.decremented_session,
      hasReservedDebt: reservedCheckinIds.has(c.id),
      memberId: c.member_id,
      memberNo: c.member?.member_no ?? null,
      firstName: c.member?.first_name ?? null,
      lastName: c.member?.last_name ?? null,
      comment: c.member?.comment ?? null,
      membershipLabel: c.membership?.membership_type?.label ?? null,
      membershipStatus: status.kind,
      membershipStatusLabel: status.label,
      trainingCategoryLabel: c.training_category?.label ?? null,
      trainerUsername: c.trainer_id ? trainerMap.get(c.trainer_id) ?? null : null,
      paymentToday: payment
        ? {
            amountRsd: payment.amount_rsd,
            membershipLabel: payment.membership_type?.label ?? null,
            kind: payment.kind,
          }
        : null,
      shiftId: c.shift_id,
      pendingAttribution:
        c.shift_id == null &&
        c.waived_at == null &&
        c.created_at >= launchAt,
    };
  });
}

export async function fetchKeyOccupancy(
  businessDate: string,
): Promise<KeyHolder[]> {
  const supabase = await getClient();
  const isToday = businessDate === businessToday();

  const { data: checkins, error } = await supabase
    .from("checkin")
    .select(
      `
      id,
      key_no,
      key_returned,
      is_fitpass,
      created_at,
      member_id,
      member ( member_no, first_name, last_name )
    `,
    )
    .eq("business_date", businessDate)
    .eq("voided", false)
    .not("key_no", "is", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const latestByKey = new Map<number, (typeof checkins)[0]>();
  for (const c of checkins ?? []) {
    if (c.key_no == null) continue;
    if (!latestByKey.has(c.key_no)) {
      latestByKey.set(c.key_no, c);
    }
  }

  const holders: KeyHolder[] = [];
  for (let keyNo = 1; keyNo <= KEY_COUNT; keyNo++) {
    const c = latestByKey.get(keyNo);
    if (!c) {
      holders.push({
        keyNo,
        checkinId: null,
        memberId: null,
        memberNo: null,
        firstName: null,
        lastName: null,
        isFitpass: false,
        isOpen: false,
      });
      continue;
    }

    const isOpen = isToday ? !c.key_returned : false;
    const memberRaw = c.member as unknown;
    const member = (Array.isArray(memberRaw) ? memberRaw[0] : memberRaw) as {
      member_no: number | null;
      first_name: string;
      last_name: string;
    } | null;

    holders.push({
      keyNo,
      checkinId: c.id,
      memberId: c.member_id,
      memberNo: member?.member_no ?? null,
      firstName: member?.first_name ?? (c.is_fitpass ? "Fitpass" : null),
      lastName: member?.last_name ?? null,
      isFitpass: c.is_fitpass,
      isOpen,
    });
  }

  return holders;
}

export async function fetchSoonToExpire(): Promise<SoonExpireMember[]> {
  const supabase = await getClient();
  const today = businessToday();
  const limitDate = new Date(`${today}T00:00:00Z`);
  limitDate.setUTCDate(limitDate.getUTCDate() + SOON_TO_EXPIRE_DAYS);
  const limitIso = limitDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("membership")
    .select(
      `
      end_date,
      member (
        id,
        member_no,
        first_name,
        last_name,
        archived
      ),
      membership_type ( label )
    `,
    )
    .eq("status", "aktivna")
    .not("end_date", "is", null)
    .lte("end_date", limitIso)
    .order("end_date");

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => {
      const m = unwrapJoin(row.member);
      return m && !m.archived;
    })
    .map((row) => {
      const m = unwrapJoin(row.member)!;
      const mt = unwrapJoin(row.membership_type);
      return {
        id: m.id,
        memberNo: m.member_no,
        firstName: m.first_name,
        lastName: m.last_name,
        endDate: row.end_date as string,
        daysLeft: daysBetween(today, row.end_date as string),
        membershipLabel: mt?.label ?? null,
      };
    });
}

export async function fetchDayStats(
  businessDate: string,
  keyHolders?: KeyHolder[],
): Promise<DayStats> {
  const supabase = await getClient();

  const [arrivalResult, paymentsResult, holders] = await Promise.all([
    supabase
      .from("checkin")
      .select("id", { count: "exact", head: true })
      .eq("business_date", businessDate)
      .eq("voided", false),
    supabase
      .from("payment")
      .select("amount_rsd")
      .eq("business_date", businessDate)
      .eq("voided", false),
    keyHolders ? Promise.resolve(keyHolders) : fetchKeyOccupancy(businessDate),
  ]);

  const openKeysCount = holders.filter((k) => k.isOpen).length;
  const takingsRsd = (paymentsResult.data ?? []).reduce(
    (s, p) => s + p.amount_rsd,
    0,
  );

  return {
    arrivalCount: arrivalResult.count ?? 0,
    openKeysCount,
    totalKeys: KEY_COUNT,
    takingsRsd,
  };
}

export async function fetchActiveStaff(): Promise<StaffOption[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("staff")
    .select("id, username")
    .eq("active", true)
    .order("username");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchCheckinMemberContext(
  memberId: string,
): Promise<CheckinMemberContext | null> {
  const supabase = await getClient();
  const today = businessToday();

  const { data: member, error: memberError } = await supabase
    .from("member")
    .select("id, member_no, first_name, last_name, phone, comment, discount_flag, archived")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) throw new Error(memberError.message);
  if (!member || member.archived) return null;

  const { data: membership } = await supabase
    .from("membership")
    .select(
      `
      id,
      status,
      end_date,
      sessions_left,
      membership_type (
        label,
        is_time_based,
        training_category_id,
        training_category (
          id,
          label,
          is_trainer_based
        )
      )
    `,
    )
    .eq("member_id", memberId)
    .in("status", ["aktivna", "pauzirana"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: unsettledCount } = await supabase
    .from("reserved_session")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("settled", false);

  const mt = unwrapJoin(membership?.membership_type) as {
    label: string;
    is_time_based: boolean;
    training_category_id: number;
    training_category: {
      id: number;
      label: string;
      is_trainer_based: boolean;
    };
  } | null;

  const summary: MembershipSummary | null = membership
    ? {
        status: membership.status as MembershipSummary["status"],
        endDate: membership.end_date,
        sessionsLeft: membership.sessions_left,
        isTimeBased: mt?.is_time_based ?? null,
      }
    : null;

  const status = getMemberStatus(summary, today);

  return {
    memberId: member.id,
    memberNo: member.member_no,
    firstName: member.first_name,
    lastName: member.last_name,
    phone: member.phone,
    comment: member.comment,
    discountFlag: member.discount_flag,
    membershipId: membership?.id ?? null,
    membershipLabel: mt?.label ?? null,
    isTrainerBased: unwrapJoin(mt?.training_category)?.is_trainer_based ?? false,
    trainingCategoryId: unwrapJoin(mt?.training_category)?.id ?? null,
    trainingCategoryLabel: unwrapJoin(mt?.training_category)?.label ?? null,
    sessionsLeft: membership?.sessions_left ?? null,
    isTimeBased: mt?.is_time_based ?? null,
    membershipStatus: status.kind,
    membershipStatusLabel: status.label,
    unsettledReservedCount: unsettledCount ?? 0,
  };
}

export async function countOpenKeysToday(): Promise<number> {
  const holders = await fetchKeyOccupancy(businessToday());
  return holders.filter((h) => h.isOpen).length;
}
