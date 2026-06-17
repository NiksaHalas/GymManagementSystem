import { requireUser } from "@/lib/auth/session";
import { businessToday } from "@/lib/time/business-day";
import {
  fetchDayPayments,
  fetchMonthTakings,
  fetchYearTakings,
} from "@/lib/pazar/queries";
import { fetchShiftsForBusinessDay } from "@/lib/shifts/queries";
import { PazarDateNav } from "@/app/(app)/pazar/date-nav";
import { PazarClient } from "@/app/(app)/pazar/pazar-client";
import { TakingsTabs } from "@/app/(app)/pazar/takings-tabs";
import { formatRsd } from "@/lib/members/format";

export const metadata = {
  title: "Pazar — Teretana",
};

interface PazarPageProps {
  searchParams: Promise<{ date?: string; view?: string; unassigned?: string }>;
}

function parseBusinessDate(raw: string | undefined, isAdmin: boolean): string {
  const today = businessToday();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (!isAdmin && raw > today) return today;
    return raw;
  }
  return today;
}

function parseView(raw: string | undefined): "day" | "month" | "year" {
  if (raw === "month" || raw === "year") return raw;
  return "day";
}

export default async function PazarPage({ searchParams }: PazarPageProps) {
  const staff = await requireUser();
  const isAdmin = staff.role === "admin";
  const { date, view: viewParam, unassigned } = await searchParams;
  const businessDate = parseBusinessDate(date, isAdmin);
  const view = isAdmin ? parseView(viewParam) : "day";
  const unassignedOnly = unassigned === "1";

  const [yearStr, monthStr] = businessDate.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const [{ rows, summary }, shifts] = await Promise.all([
    fetchDayPayments(businessDate, { unassignedOnly }),
    isAdmin && unassignedOnly
      ? fetchShiftsForBusinessDay(businessDate)
      : Promise.resolve([]),
  ]);

  const monthData =
    isAdmin && view === "month"
      ? await fetchMonthTakings(year, month)
      : null;
  const yearData =
    isAdmin && view === "year" ? await fetchYearTakings(year) : null;

  const isToday = businessDate === businessToday();
  const canEdit = (isAdmin || isToday) && !unassignedOnly;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pazar</h1>
          <p className="text-muted-foreground text-sm">
            Dnevne uplate i pregled pazara
          </p>
        </div>
        <PazarDateNav businessDate={businessDate} blockFuture={!isAdmin} />
      </div>

      {unassignedOnly && isAdmin && (
        <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm">
          Prikaz samo uplata bez dodeljene smene (od lansiranja atribucije).
        </div>
      )}

      {isAdmin && !unassignedOnly && (
        <TakingsTabs
          businessDate={businessDate}
          view={view}
          monthTotal={monthData?.total}
          monthDays={monthData?.days}
          yearTotal={yearData?.total}
          yearMonths={yearData?.months}
          year={year}
          month={month}
        />
      )}

      {(view === "day" || !isAdmin || unassignedOnly) && (
        <>
          <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
            Neto total za {businessDate}:{" "}
            <span className="font-semibold">{formatRsd(summary.total)}</span>
            <span className="text-muted-foreground ml-2">
              ({summary.count} uplata)
            </span>
          </div>
          <PazarClient
            rows={rows}
            summary={summary}
            canEdit={canEdit}
            reconcileMode={isAdmin && unassignedOnly}
            shifts={shifts}
          />
        </>
      )}
    </div>
  );
}
