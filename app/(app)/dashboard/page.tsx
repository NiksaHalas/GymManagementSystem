import { isCounterDevice } from "@/lib/auth/counter";
import { getCurrentStaff } from "@/lib/auth/session";
import { businessToday } from "@/lib/time/business-day";
import {
  fetchDayCheckins,
  fetchDayStats,
  fetchKeyOccupancy,
  fetchSoonToExpire,
  fetchActiveStaff,
} from "@/lib/dashboard/queries";
import { fetchShiftsForBusinessDay } from "@/lib/shifts/queries";
import { DashboardCounter } from "@/app/(app)/dashboard/dashboard-counter";
import { DashboardOverview } from "@/app/(app)/dashboard/dashboard-overview";

export const metadata = {
  title: "Dashboard — Teretana",
};

interface DashboardPageProps {
  searchParams: Promise<{ date?: string; unassigned?: string }>;
}

function parseBusinessDate(raw: string | undefined): string {
  const today = businessToday();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw > today ? today : raw;
  }
  return today;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { date, unassigned } = await searchParams;
  const businessDate = parseBusinessDate(date);
  const unassignedOnly = unassigned === "1";

  const [counter, staff] = await Promise.all([
    isCounterDevice(),
    getCurrentStaff(),
  ]);

  const isToday = businessDate === businessToday();
  const canOperate = counter && isToday;
  const isAdmin = staff?.role === "admin";

  const [checkins, keyHolders, soonExpire, staffOptions, shifts] =
    await Promise.all([
      fetchDayCheckins(businessDate, { unassignedOnly }),
      fetchKeyOccupancy(businessDate),
      fetchSoonToExpire(),
      canOperate ? fetchActiveStaff() : Promise.resolve([]),
      isAdmin && unassignedOnly
        ? fetchShiftsForBusinessDay(businessDate)
        : Promise.resolve([]),
    ]);

  const stats =
    !counter && isAdmin && !unassignedOnly
      ? await fetchDayStats(businessDate, keyHolders)
      : null;

  if (!counter && isAdmin && stats && !unassignedOnly) {
    return (
      <DashboardOverview
        businessDate={businessDate}
        checkins={checkins}
        keyHolders={keyHolders}
        stats={stats}
      />
    );
  }

  return (
    <>
      {unassignedOnly && isAdmin && (
        <div className="mb-4 rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm">
          Prikaz samo dolazaka bez dodeljene smene (od lansiranja atribucije).
        </div>
      )}
      {!counter && !unassignedOnly && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          Operacije (check-in, Fitpass) su dostupne samo na šalteru. Prikaz je
          samo za pregled.
        </div>
      )}
      <DashboardCounter
        businessDate={businessDate}
        checkins={checkins}
        keyHolders={keyHolders}
        soonExpire={soonExpire}
        staffOptions={staffOptions}
        canOperate={canOperate}
        reconcileMode={isAdmin && unassignedOnly}
        shifts={shifts}
      />
    </>
  );
}
