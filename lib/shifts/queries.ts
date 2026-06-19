import "server-only";

import { getServerSupabase } from "@/lib/supabase/server-client";
import { getShiftAttributionLaunchAt } from "@/lib/shifts/config";
import {
  addDays,
  belgradeDayOf,
  belgradeInstant,
  businessToday,
} from "@/lib/time/business-day";
import {
  formatHm,
  formatWeekdayLong,
  GYM_OPEN,
  gymCloseTime,
} from "@/lib/shifts/format";

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

const GAP_THRESHOLD_MS = 5 * 60 * 1000;

export interface CoverageGap {
  from: string;
  to: string;
  ms: number;
  /** -1 = before first shift; otherwise after shift at this index */
  insertAfterIndex: number;
}

export interface ShiftHistoryRow {
  id: string;
  staffId: string;
  staffUsername: string;
  startedAt: string;
  endedAt: string | null;
  endedReason: string | null;
  durationMs: number;
  isOpen: boolean;
  nextStartedAtSameDay: string | null;
}

export interface WorkerDaySummary {
  staffId: string;
  staffUsername: string;
  rangeStart: string;
  rangeEnd: string;
  totalDurationMs: number;
}

export interface ShiftHistoryDay {
  date: string;
  weekday: string;
  workerSummaries: WorkerDaySummary[];
  shifts: ShiftHistoryRow[];
  coverageGaps: CoverageGap[];
}

interface RawShiftRow {
  id: string;
  staff_id: string;
  started_at: string;
  ended_at: string | null;
  ended_reason: string | null;
  staff: { username: string } | { username: string }[] | null;
}

function pickStaffUsername(
  staff: RawShiftRow["staff"],
): string {
  const row = Array.isArray(staff) ? staff[0] : staff;
  return row?.username ?? "—";
}

interface IntervalBlock {
  start: number;
  end: number;
  shiftIndices: number[];
}

function computeCoverageGaps(
  dateIso: string,
  shifts: ShiftHistoryRow[],
  now: Date,
): CoverageGap[] {
  const openInstant = belgradeInstant(dateIso, GYM_OPEN);
  const closeInstant = belgradeInstant(dateIso, gymCloseTime(dateIso));
  const today = businessToday();
  const endInstant =
    dateIso === today
      ? new Date(Math.min(now.getTime(), closeInstant.getTime()))
      : closeInstant;

  if (endInstant.getTime() <= openInstant.getTime()) {
    return [];
  }

  const openMs = openInstant.getTime();
  const endMs = endInstant.getTime();

  const clamped = shifts.map((s, idx) => {
    const start = Math.max(new Date(s.startedAt).getTime(), openMs);
    const rawEnd = s.endedAt ? new Date(s.endedAt).getTime() : now.getTime();
    const end = Math.min(rawEnd, endMs);
    return { start, end, idx };
  }).filter((c) => c.end > c.start);

  if (clamped.length === 0) {
    const gapMs = endMs - openMs;
    if (gapMs < GAP_THRESHOLD_MS) return [];
    return [
      {
        from: formatHm(openInstant),
        to: formatHm(endInstant),
        ms: gapMs,
        insertAfterIndex: -1,
      },
    ];
  }

  const blocks: IntervalBlock[] = [];
  for (const interval of clamped) {
    if (blocks.length === 0) {
      blocks.push({
        start: interval.start,
        end: interval.end,
        shiftIndices: [interval.idx],
      });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (interval.start <= last.end + GAP_THRESHOLD_MS) {
      last.end = Math.max(last.end, interval.end);
      last.shiftIndices.push(interval.idx);
    } else {
      blocks.push({
        start: interval.start,
        end: interval.end,
        shiftIndices: [interval.idx],
      });
    }
  }

  const gaps: CoverageGap[] = [];

  const firstGapMs = blocks[0].start - openMs;
  if (firstGapMs >= GAP_THRESHOLD_MS) {
    gaps.push({
      from: formatHm(openInstant),
      to: formatHm(new Date(blocks[0].start)),
      ms: firstGapMs,
      insertAfterIndex: -1,
    });
  }

  for (let i = 0; i < blocks.length - 1; i++) {
    const gapMs = blocks[i + 1].start - blocks[i].end;
    if (gapMs >= GAP_THRESHOLD_MS) {
      const lastIdx = blocks[i].shiftIndices[blocks[i].shiftIndices.length - 1];
      gaps.push({
        from: formatHm(new Date(blocks[i].end)),
        to: formatHm(new Date(blocks[i + 1].start)),
        ms: gapMs,
        insertAfterIndex: lastIdx,
      });
    }
  }

  const lastBlock = blocks[blocks.length - 1];
  const tailGapMs = endMs - lastBlock.end;
  if (tailGapMs >= GAP_THRESHOLD_MS) {
    const lastIdx =
      lastBlock.shiftIndices[lastBlock.shiftIndices.length - 1];
    gaps.push({
      from: formatHm(new Date(lastBlock.end)),
      to: formatHm(endInstant),
      ms: tailGapMs,
      insertAfterIndex: lastIdx,
    });
  }

  return gaps;
}

function buildWorkerSummaries(
  shifts: ShiftHistoryRow[],
  now: Date,
): WorkerDaySummary[] {
  const byStaff = new Map<string, ShiftHistoryRow[]>();
  for (const s of shifts) {
    const list = byStaff.get(s.staffId) ?? [];
    list.push(s);
    byStaff.set(s.staffId, list);
  }

  const summaries: WorkerDaySummary[] = [];

  for (const [, staffShifts] of byStaff) {
    let minStart = Infinity;
    let maxEnd = 0;
    let totalMs = 0;

    for (const s of staffShifts) {
      const startMs = new Date(s.startedAt).getTime();
      const endMs = s.endedAt
        ? new Date(s.endedAt).getTime()
        : now.getTime();
      minStart = Math.min(minStart, startMs);
      maxEnd = Math.max(maxEnd, endMs);
      totalMs += s.durationMs;
    }

    summaries.push({
      staffId: staffShifts[0].staffId,
      staffUsername: staffShifts[0].staffUsername,
      rangeStart: formatHm(new Date(minStart)),
      rangeEnd: formatHm(new Date(maxEnd)),
      totalDurationMs: totalMs,
    });
  }

  return summaries.sort((a, b) =>
    a.staffUsername.localeCompare(b.staffUsername, "sr"),
  );
}

/**
 * Shift history for a Mon–Sun week starting at `weekStartIso`, grouped by Belgrade
 * business day of `started_at`. Optional `staffId` filters to one worker.
 */
export async function fetchShiftHistory(
  weekStartIso: string,
  staffId?: string,
): Promise<ShiftHistoryDay[]> {
  const supabase = await getServerSupabase();
  const weekStartInstant = belgradeInstant(weekStartIso, "00:00");
  const weekEndExclusiveInstant = belgradeInstant(addDays(weekStartIso, 7), "00:00");
  const weekEndExclusiveIsoStr = weekEndExclusiveInstant.toISOString();
  const now = new Date();

  let query = supabase
    .from("shift")
    .select(
      "id, staff_id, started_at, ended_at, ended_reason, staff!shift_staff_id_fkey(username)",
    )
    .lte("started_at", weekEndExclusiveIsoStr)
    .order("started_at", { ascending: true });

  if (staffId) {
    query = query.eq("staff_id", staffId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const overlapping = (data ?? []).filter((row) => {
    const raw = row as RawShiftRow;
    const start = new Date(raw.started_at).getTime();
    const end = raw.ended_at
      ? new Date(raw.ended_at).getTime()
      : now.getTime();
    return start < weekEndExclusiveInstant.getTime() && end >= weekStartInstant.getTime();
  }) as RawShiftRow[];

  const byDay = new Map<string, RawShiftRow[]>();
  for (const row of overlapping) {
    const day = belgradeDayOf(row.started_at);
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }

  const days: ShiftHistoryDay[] = [];

  for (let i = 0; i < 7; i++) {
    const dateIso = addDays(weekStartIso, i);
    const rawShifts = byDay.get(dateIso) ?? [];

    const shifts: ShiftHistoryRow[] = rawShifts.map((row) => {
      const startMs = new Date(row.started_at).getTime();
      const endMs = row.ended_at
        ? new Date(row.ended_at).getTime()
        : now.getTime();
      const isOpen = row.ended_at == null;

      return {
        id: row.id,
        staffId: row.staff_id,
        staffUsername: pickStaffUsername(row.staff),
        startedAt: row.started_at,
        endedAt: row.ended_at,
        endedReason: row.ended_reason,
        durationMs: Math.max(0, endMs - startMs),
        isOpen,
        nextStartedAtSameDay: null,
      };
    });

    shifts.sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );

    for (let j = 0; j < shifts.length; j++) {
      shifts[j].nextStartedAtSameDay =
        j < shifts.length - 1 ? shifts[j + 1].startedAt : null;
    }

    const coverageGaps = computeCoverageGaps(dateIso, shifts, now);
    const workerSummaries = buildWorkerSummaries(shifts, now);

    days.push({
      date: dateIso,
      weekday: formatWeekdayLong(dateIso),
      workerSummaries,
      shifts,
      coverageGaps,
    });
  }

  return days;
}

export async function fetchStaffForShiftFilter(): Promise<
  { id: string; username: string }[]
> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("staff")
    .select("id, username")
    .order("username");

  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; username: string }[];
}
