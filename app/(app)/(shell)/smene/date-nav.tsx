"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, businessToday } from "@/lib/time/business-day";
import { formatWeekRangeLabel } from "@/lib/shifts/format";

interface SmeneWeekNavProps {
  anchorDate: string;
  weekStart: string;
}

export function SmeneWeekNav({ anchorDate, weekStart }: SmeneWeekNavProps) {
  const router = useRouter();
  const today = businessToday();
  const isCurrentWeek =
    weekStart <= today && addDays(weekStart, 6) >= today;

  function navigate(date: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("date", date);
    router.push(`/smene?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Prethodna sedmica"
        onClick={() => navigate(addDays(anchorDate, -7))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium tabular-nums">
        {formatWeekRangeLabel(weekStart)}
      </span>
      <input
        type="date"
        value={anchorDate}
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
        aria-label="Sledeća sedmica"
        onClick={() => navigate(addDays(anchorDate, 7))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {!isCurrentWeek && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate(today)}
        >
          Danas
        </Button>
      )}
    </div>
  );
}
