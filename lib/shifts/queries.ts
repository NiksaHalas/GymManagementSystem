import "server-only";

import { getServerSupabase } from "@/lib/supabase/server-client";
import { getShiftAttributionLaunchAt } from "@/lib/shifts/config";

export interface ShiftOption {
  id: string;
  staffUsername: string;
  startedAt: string;
  endedAt: string | null;
  label: string;
}

/** Admin badge: checkins + payments pending shift attribution since launch. */
export async function fetchPendingAttributionCount(
  launchAt?: string,
): Promise<number> {
  const supabase = await getServerSupabase();
  const cutoff = launchAt ?? getShiftAttributionLaunchAt();

  const [checkins, payments] = await Promise.all([
    supabase
      .from("checkin")
      .select("id", { count: "exact", head: true })
      .is("shift_id", null)
      .is("waived_at", null)
      .eq("voided", false)
      .gte("created_at", cutoff),
    supabase
      .from("payment")
      .select("id", { count: "exact", head: true })
      .is("shift_id", null)
      .is("waived_at", null)
      .eq("voided", false)
      .gte("created_at", cutoff),
  ]);

  if (checkins.error) throw new Error(checkins.error.message);
  if (payments.error) throw new Error(payments.error.message);

  return (checkins.count ?? 0) + (payments.count ?? 0);
}

/**
 * Shifts whose interval overlaps the given business date (for reconcile dropdown).
 * A shift covers a business day if started_at <= end of day AND (ended_at IS NULL OR ended_at >= start of day).
 */
export async function fetchShiftsForBusinessDay(
  businessDate: string,
): Promise<ShiftOption[]> {
  const supabase = await getServerSupabase();
  const dayStart = new Date(`${businessDate}T00:00:00+02:00`).getTime();
  const dayEnd = new Date(`${businessDate}T23:59:59.999+02:00`).getTime();

  const { data, error } = await supabase
    .from("shift")
    .select("id, started_at, ended_at, staff!shift_staff_id_fkey(username)")
    .lte("started_at", new Date(dayEnd).toISOString())
    .order("started_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => {
      const start = new Date(row.started_at as string).getTime();
      const end = row.ended_at
        ? new Date(row.ended_at as string).getTime()
        : Date.now();
      return start <= dayEnd && end >= dayStart;
    })
    .map((row) => {
    const staffRaw = row.staff as { username: string } | { username: string }[] | null;
    const staff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
    const username = staff?.username ?? "—";
    const start = new Date(row.started_at as string).toLocaleString("sr-RS", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const end = row.ended_at
      ? new Date(row.ended_at as string).toLocaleString("sr-RS", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "otvorena";

    return {
      id: row.id as string,
      staffUsername: username,
      startedAt: row.started_at as string,
      endedAt: (row.ended_at as string | null) ?? null,
      label: `${username} (${start} – ${end})`,
    };
  });
}
