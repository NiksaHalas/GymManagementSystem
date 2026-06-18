"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { businessToday } from "@/lib/time/business-day";
import { shiftBusinessDate } from "@/lib/dashboard/format";

interface DateNavProps {
  businessDate: string;
}

export function DateNav({ businessDate }: DateNavProps) {
  const router = useRouter();
  const today = businessToday();
  const isToday = businessDate === today;

  function navigate(date: string) {
    router.push(`/dashboard?date=${date}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Prethodni dan"
        onClick={() => navigate(shiftBusinessDate(businessDate, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <input
        type="date"
        value={businessDate}
        max={today}
        onChange={(e) => {
          const v = e.target.value;
          if (v) navigate(v);
        }}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Sledeći dan"
        disabled={isToday}
        onClick={() => navigate(shiftBusinessDate(businessDate, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!isToday && (
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate(today)}>
          Danas
        </Button>
      )}
    </div>
  );
}
