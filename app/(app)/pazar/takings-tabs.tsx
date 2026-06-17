"use client";

import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRsd } from "@/lib/members/format";
import { formatDate } from "@/lib/pazar/format";
import type { DayTotal, MonthTotal } from "@/lib/pazar/types";

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "Mart",
  "April",
  "Maj",
  "Jun",
  "Jul",
  "Avgust",
  "Septembar",
  "Oktobar",
  "Novembar",
  "Decembar",
];

interface TakingsTabsProps {
  businessDate: string;
  view: "day" | "month" | "year";
  monthTotal?: number;
  monthDays?: DayTotal[];
  yearTotal?: number;
  yearMonths?: MonthTotal[];
  year: number;
  month: number;
}

export function TakingsTabs({
  businessDate,
  view,
  monthTotal = 0,
  monthDays = [],
  yearTotal = 0,
  yearMonths = [],
  year,
  month,
}: TakingsTabsProps) {
  const router = useRouter();

  function setView(next: string) {
    const params = new URLSearchParams();
    params.set("date", businessDate);
    if (next !== "day") params.set("view", next);
    router.push(`/pazar?${params.toString()}`);
  }

  function exportCsv(period: "day" | "month" | "year") {
    const params = new URLSearchParams({ period, date: businessDate });
    window.location.href = `/api/admin/pazar/export?${params.toString()}`;
  }

  return (
    <Tabs value={view} onValueChange={setView}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="day">Dan</TabsTrigger>
          <TabsTrigger value="month">Mesec</TabsTrigger>
          <TabsTrigger value="year">Godina</TabsTrigger>
        </TabsList>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => exportCsv(view)}
        >
          <Download className="mr-2 h-4 w-4" />
          Izvoz CSV
        </Button>
      </div>

      <TabsContent value="month" className="mt-4 space-y-4">
        <p className="text-lg font-semibold">
          {MONTH_NAMES[month - 1]} {year}: {formatRsd(monthTotal)}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead className="text-right">Uplata</TableHead>
              <TableHead className="text-right">Broj</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthDays.map((d) => (
              <TableRow key={d.businessDate}>
                <TableCell>{formatDate(d.businessDate)}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatRsd(d.total)}
                </TableCell>
                <TableCell className="text-right">{d.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TabsContent>

      <TabsContent value="year" className="mt-4 space-y-4">
        <p className="text-lg font-semibold">
          {year}: {formatRsd(yearTotal)}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mesec</TableHead>
              <TableHead className="text-right">Uplata</TableHead>
              <TableHead className="text-right">Broj</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {yearMonths.map((m) => (
              <TableRow key={m.month}>
                <TableCell>{MONTH_NAMES[m.month - 1]}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatRsd(m.total)}
                </TableCell>
                <TableCell className="text-right">{m.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TabsContent>
    </Tabs>
  );
}
