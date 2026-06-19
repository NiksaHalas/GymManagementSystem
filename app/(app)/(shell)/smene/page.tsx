import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import {
  businessToday,
  weekStartMonday,
} from "@/lib/time/business-day";
import {
  fetchShiftHistory,
  fetchStaffForShiftFilter,
} from "@/lib/shifts/queries";
import { SmeneWeekNav } from "@/app/(app)/(shell)/smene/date-nav";
import { SmeneWorkerFilter } from "@/app/(app)/(shell)/smene/worker-filter";
import { SmeneClient } from "@/app/(app)/(shell)/smene/smene-client";
import { buttonVariants } from "@/components/ui/button";
import { Download } from "lucide-react";

export const metadata = {
  title: "Smene — Teretana",
};

interface SmenePageProps {
  searchParams: Promise<{ date?: string; staff?: string }>;
}

function parseDate(raw: string | undefined): string {
  const today = businessToday();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return today;
}

export default async function SmenePage({ searchParams }: SmenePageProps) {
  await requireUser();

  const { date: dateParam, staff: staffParam } = await searchParams;
  const anchorDate = parseDate(dateParam);
  const weekStart = weekStartMonday(anchorDate);
  const staffId =
    staffParam && staffParam.length > 0 ? staffParam : undefined;

  const [days, staffOptions] = await Promise.all([
    fetchShiftHistory(weekStart, staffId),
    fetchStaffForShiftFilter(),
  ]);

  const exportParams = new URLSearchParams({ date: anchorDate });
  if (staffId) exportParams.set("staff", staffId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Smene</h1>
          <p className="text-muted-foreground text-sm">
            Istorija smena radnika po sedmici
          </p>
        </div>
        <SmeneWeekNav anchorDate={anchorDate} weekStart={weekStart} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SmeneWorkerFilter
          staffOptions={staffOptions}
          selectedStaffId={staffId}
          anchorDate={anchorDate}
        />
        <Link
          href={`/api/admin/smene/export?${exportParams.toString()}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="mr-2 h-4 w-4" />
          Izvezi CSV
        </Link>
      </div>

      <SmeneClient days={days} />
    </div>
  );
}
