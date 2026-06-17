"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ShiftOption } from "@/lib/shifts/queries";
import {
  assignShiftToCheckin,
  waiveCheckinAttribution,
} from "@/lib/shifts/reconcile-actions";

interface CheckinReconcileActionsProps {
  checkinId: string;
  businessDate: string;
  shifts: ShiftOption[];
}

export function CheckinReconcileActions({
  checkinId,
  businessDate,
  shifts,
}: CheckinReconcileActionsProps) {
  const router = useRouter();
  const [shiftId, setShiftId] = React.useState<string>("");
  const [pending, setPending] = React.useState(false);

  async function handleAssign() {
    if (!shiftId) {
      toast.error("Izaberite smenu.");
      return;
    }
    setPending(true);
    try {
      const result = await assignShiftToCheckin(checkinId, shiftId);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Smena dodeljena.");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  async function handleWaive() {
    setPending(true);
    try {
      const result = await waiveCheckinAttribution(checkinId);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Označeno kao razrešeno.");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  const dayShifts = shifts.filter((s) => {
    const start = s.startedAt.slice(0, 10);
    const end = s.endedAt?.slice(0, 10) ?? businessDate;
    return start <= businessDate && end >= businessDate;
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={shiftId} onValueChange={setShiftId} disabled={pending}>
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue placeholder="Dodeli smenu" />
        </SelectTrigger>
        <SelectContent>
          {dayShifts.length === 0 ? (
            <SelectItem value="__none" disabled>
              Nema smena za {businessDate}
            </SelectItem>
          ) : (
            dayShifts.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending || !shiftId}
        onClick={handleAssign}
      >
        Dodeli
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={handleWaive}
      >
        Razrešeno
      </Button>
    </div>
  );
}
