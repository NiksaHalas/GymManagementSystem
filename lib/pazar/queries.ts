import "server-only";

import { getServerSupabase } from "@/lib/supabase/server-client";
import { getMemberStatus } from "@/lib/members/status";
import { paymentKindLabel } from "@/lib/pazar/format";
import { getShiftAttributionLaunchAt } from "@/lib/shifts/config";
import type {
  DayTotal,
  MonthTotal,
  PaymentContext,
  PaymentRow,
  ScheduledMembership,
  TakingsSummary,
  UnsettledDebt,
} from "@/lib/pazar/types";
import type { PaymentKind } from "@/lib/db/types";

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type RawPayment = {
  id: string;
  member_id: string | null;
  kind: PaymentKind;
  amount_rsd: number;
  is_custom_price: boolean;
  custom_reason: string | null;
  voided: boolean;
  paid_at: string;
  business_date: string;
  shift_id: string | null;
  waived_at: string | null;
  member: {
    member_no: number | null;
    first_name: string;
    last_name: string;
  } | null;
  membership_type: { label: string } | null;
  staff: { username: string } | null;
};

function mapPaymentRow(raw: RawPayment): PaymentRow {
  const member = unwrapJoin(raw.member);
  const mt = unwrapJoin(raw.membership_type);
  const staff = unwrapJoin(raw.staff);
  const launchAt = getShiftAttributionLaunchAt();

  const label =
    mt?.label ??
    (raw.kind === "membership" ? paymentKindLabel("membership") : paymentKindLabel(raw.kind));

  return {
    id: raw.id,
    memberId: raw.member_id,
    memberNo: member?.member_no ?? null,
    memberFirstName: member?.first_name ?? null,
    memberLastName: member?.last_name ?? null,
    kind: raw.kind,
    label,
    amountRsd: raw.amount_rsd,
    isCustomPrice: raw.is_custom_price,
    customReason: raw.custom_reason,
    voided: raw.voided,
    paidAt: raw.paid_at,
    businessDate: raw.business_date,
    staffUsername: staff?.username ?? "—",
    shiftId: raw.shift_id,
    pendingAttribution:
      raw.shift_id == null &&
      raw.waived_at == null &&
      raw.paid_at >= launchAt,
  };
}

export async function fetchDayPayments(
  businessDate: string,
  options?: { unassignedOnly?: boolean },
): Promise<{
  rows: PaymentRow[];
  summary: TakingsSummary;
}> {
  const supabase = await getServerSupabase();
  const launchAt = getShiftAttributionLaunchAt();

  let query = supabase
    .from("payment")
    .select(
      `
      id,
      member_id,
      kind,
      amount_rsd,
      is_custom_price,
      custom_reason,
      voided,
      paid_at,
      business_date,
      shift_id,
      waived_at,
      member ( member_no, first_name, last_name ),
      membership_type ( label ),
      staff!payment_staff_id_fkey ( username )
    `,
    )
    .eq("business_date", businessDate);

  if (options?.unassignedOnly) {
    query = query
      .is("shift_id", null)
      .is("waived_at", null)
      .gte("created_at", launchAt);
  }

  const { data, error } = await query.order("paid_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as RawPayment[]).map(mapPaymentRow);

  const active = rows.filter((r) => !r.voided);
  const summary: TakingsSummary = {
    total: active.reduce((s, r) => s + r.amountRsd, 0),
    membership: active
      .filter((r) => r.kind === "membership")
      .reduce((s, r) => s + r.amountRsd, 0),
    debtSettlement: active
      .filter((r) => r.kind === "debt_settlement")
      .reduce((s, r) => s + r.amountRsd, 0),
    fitpassSurcharge: active
      .filter((r) => r.kind === "fitpass_surcharge")
      .reduce((s, r) => s + r.amountRsd, 0),
    count: active.length,
  };

  return { rows, summary };
}

export async function fetchMonthTakings(
  year: number,
  month: number,
): Promise<{ total: number; days: DayTotal[] }> {
  const supabase = await getServerSupabase();
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const { data, error } = await supabase
    .from("payment")
    .select("business_date, amount_rsd")
    .eq("voided", false)
    .gte("business_date", start)
    .lt("business_date", end);

  if (error) throw new Error(error.message);

  const byDay = new Map<string, { total: number; count: number }>();
  for (const row of data ?? []) {
    const d = row.business_date as string;
    const entry = byDay.get(d) ?? { total: 0, count: 0 };
    entry.total += row.amount_rsd as number;
    entry.count += 1;
    byDay.set(d, entry);
  }

  const days: DayTotal[] = [...byDay.entries()]
    .map(([businessDate, v]) => ({
      businessDate,
      total: v.total,
      count: v.count,
    }))
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate));

  const total = days.reduce((s, d) => s + d.total, 0);
  return { total, days };
}

export async function fetchYearTakings(
  year: number,
): Promise<{ total: number; months: MonthTotal[] }> {
  const supabase = await getServerSupabase();
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;

  const { data, error } = await supabase
    .from("payment")
    .select("business_date, amount_rsd")
    .eq("voided", false)
    .gte("business_date", start)
    .lt("business_date", end);

  if (error) throw new Error(error.message);

  const byMonth = new Map<number, { total: number; count: number }>();
  for (const row of data ?? []) {
    const d = row.business_date as string;
    const m = parseInt(d.slice(5, 7), 10);
    const entry = byMonth.get(m) ?? { total: 0, count: 0 };
    entry.total += row.amount_rsd as number;
    entry.count += 1;
    byMonth.set(m, entry);
  }

  const months: MonthTotal[] = [...byMonth.entries()]
    .map(([month, v]) => ({
      year,
      month,
      total: v.total,
      count: v.count,
    }))
    .sort((a, b) => b.month - a.month);

  const total = months.reduce((s, m) => s + m.total, 0);
  return { total, months };
}

export async function fetchPaymentContext(
  memberId: string,
): Promise<PaymentContext | null> {
  const supabase = await getServerSupabase();

  const { data: member, error: memberErr } = await supabase
    .from("member")
    .select("id, member_no, first_name, last_name, discount_flag, archived")
    .eq("id", memberId)
    .maybeSingle();

  if (memberErr) throw new Error(memberErr.message);
  if (!member || member.archived) return null;

  const [activeRes, scheduledRes, debtsRes] = await Promise.all([
    supabase
      .from("membership")
      .select(
        "status, end_date, sessions_left, membership_type(is_time_based, label, package)",
      )
      .eq("member_id", memberId)
      .in("status", ["aktivna", "pauzirana"])
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("membership")
      .select("id, created_at, membership_type(label, package)")
      .eq("member_id", memberId)
      .eq("status", "zakazana")
      .order("created_at", { ascending: true }),
    supabase
      .from("reserved_session")
      .select("id, session_date, amount_rsd, training_category(label)")
      .eq("member_id", memberId)
      .eq("settled", false)
      .order("session_date", { ascending: true }),
  ]);

  if (activeRes.error) throw new Error(activeRes.error.message);
  if (scheduledRes.error) throw new Error(scheduledRes.error.message);
  if (debtsRes.error) throw new Error(debtsRes.error.message);

  const current = activeRes.data?.[0] ?? null;
  const mt = current
    ? (unwrapJoin(
        (current.membership_type ?? null) as
          | { is_time_based: boolean; label: string; package: string }
          | { is_time_based: boolean; label: string; package: string }[]
          | null,
      ) ?? null)
    : null;

  const currentMembership = current
    ? {
        status: current.status as "aktivna" | "pauzirana",
        endDate: current.end_date as string | null,
        sessionsLeft: current.sessions_left as number | null,
        isTimeBased: mt?.is_time_based ?? null,
      }
    : null;

  const scheduledMemberships: ScheduledMembership[] = (scheduledRes.data ?? []).map(
    (m) => {
      const smt = unwrapJoin(
        m.membership_type as
          | { label: string; package: string }
          | { label: string; package: string }[]
          | null,
      );
      return {
        id: m.id as string,
        label: smt?.label ?? "—",
        package: smt?.package ?? "—",
        createdAt: m.created_at as string,
      };
    },
  );

  const unsettledDebts: UnsettledDebt[] = (debtsRes.data ?? []).map((d) => {
    const tc = unwrapJoin(
      d.training_category as { label: string } | { label: string }[] | null,
    );
    return {
      id: d.id as string,
      sessionDate: d.session_date as string,
      amountRsd: d.amount_rsd as number,
      trainingCategoryLabel: tc?.label ?? "—",
    };
  });

  return {
    memberId: member.id,
    memberNo: member.member_no,
    firstName: member.first_name,
    lastName: member.last_name,
    discountFlag: member.discount_flag,
    currentMembership,
    scheduledMemberships,
    unsettledDebts,
    hasActiveMembership: getMemberStatus(currentMembership).kind === "active" ||
      getMemberStatus(currentMembership).kind === "paused",
  };
}

export async function fetchScheduledMemberships(memberId: string) {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("membership")
    .select("id, created_at, membership_type(label, package)")
    .eq("member_id", memberId)
    .eq("status", "zakazana")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((m) => {
    const mt = unwrapJoin(
      m.membership_type as
        | { label: string; package: string }
        | { label: string; package: string }[]
        | null,
    );
    return {
      id: m.id as string,
      label: mt?.label ?? "—",
      package: mt?.package ?? "—",
      createdAt: m.created_at as string,
    };
  });
}
