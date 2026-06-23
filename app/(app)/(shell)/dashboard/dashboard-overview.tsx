import Link from "next/link";
import { DateNav } from "@/app/(app)/(shell)/dashboard/date-nav";
import { ArrivalsTable } from "@/app/(app)/(shell)/dashboard/arrivals-table";
import { KeysPanel } from "@/app/(app)/(shell)/dashboard/keys-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRsd } from "@/lib/members/format";
import type {
  DashboardCheckinRow,
  DayStats,
  KeyHolder,
  UnreturnedKey,
} from "@/lib/dashboard/types";

interface DashboardOverviewProps {
  businessDate: string;
  checkins: DashboardCheckinRow[];
  keyHolders: KeyHolder[];
  unreturnedKeys: UnreturnedKey[];
  isPastClosing: boolean;
  stats: DayStats;
}

export function DashboardOverview({
  businessDate,
  checkins,
  keyHolders,
  unreturnedKeys,
  isPastClosing,
  stats,
}: DashboardOverviewProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav businessDate={businessDate} />
        <span className="text-muted-foreground text-sm">Samo pregled</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Dolasci</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.arrivalCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ključevi u upotrebi</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats.openKeysCount}/{stats.totalKeys}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pazar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatRsd(stats.takingsRsd)}</p>
            <Link
              href={`/pazar?date=${businessDate}`}
              className="text-primary mt-1 inline-block text-sm hover:underline"
            >
              Otvori pazar →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <ArrivalsTable rows={checkins} canOperate={false} occupiedOpenKeys={[]} />
        </div>
        <aside className="w-full shrink-0 lg:w-52 xl:w-56">
          <KeysPanel
            holders={keyHolders}
            unreturnedKeys={unreturnedKeys}
            isPastClosing={isPastClosing}
            businessDate={businessDate}
          />
        </aside>
      </div>
    </div>
  );
}
