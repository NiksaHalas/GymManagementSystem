"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { businessToday } from "@/lib/time/business-day";
import { shiftBusinessDate } from "@/lib/dashboard/format";

interface PazarDateNavProps {
  businessDate: string;
  blockFuture?: boolean;
}

export function PazarDateNav({
  businessDate,
  blockFuture = true,
}: PazarDateNavProps) {
  const router = useRouter();
  const today = businessToday();
  const isToday = businessDate === today;

  function navigate(date: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("date", date);
    router.push(`/pazar?${params.toString()}`);
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
        max={blockFuture ? today : undefined}
        onChange={(e) => {
          const v = e.target.value;
          if (v) navigate(v > today && blockFuture ? today : v);
        }}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Sledeći dan"
        disabled={blockFuture && isToday}
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
