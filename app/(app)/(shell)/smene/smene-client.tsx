"use client";

import { Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  CoverageGap,
  ShiftHistoryDay,
  ShiftHistoryRow,
} from "@/lib/shifts/queries";
import {
  formatDayHeader,
  formatHm,
  formatShiftDuration,
  shiftEndReasonLabel,
} from "@/lib/shifts/format";
import { cn } from "@/lib/utils";

interface SmeneClientProps {
  days: ShiftHistoryDay[];
}

function EndReasonBadge({ shift }: { shift: ShiftHistoryRow }) {
  const { label, tone, tooltip } = shiftEndReasonLabel(
    shift.endedReason,
    shift.isOpen,
  );

  const badge = (
    <Badge variant="outline" className={cn("text-[11px]", tone)}>
      {label}
    </Badge>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}

function CoverageRow({ gap }: { gap: CoverageGap }) {
  return (
    <TableRow className="bg-amber-500/5 hover:bg-amber-500/10">
      <TableCell colSpan={6} className="text-amber-800 dark:text-amber-400 text-sm">
        ⚠ Bez pokrivenosti: {gap.from}–{gap.to} ({formatShiftDuration(gap.ms)})
      </TableCell>
    </TableRow>
  );
}

function CoverageCard({ gap }: { gap: CoverageGap }) {
  return (
    <div
      className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-400"
    >
      ⚠ Bez pokrivenosti: {gap.from}–{gap.to} ({formatShiftDuration(gap.ms)})
    </div>
  );
}

function ShiftTableRow({ shift }: { shift: ShiftHistoryRow }) {
  return (
    <TableRow className={cn(shift.isOpen && "bg-green-500/5")}>
      <TableCell className="font-medium">{shift.staffUsername}</TableCell>
      <TableCell>{formatHm(shift.startedAt)}</TableCell>
      <TableCell>
        {shift.endedAt ? formatHm(shift.endedAt) : "—"}
      </TableCell>
      <TableCell>{formatShiftDuration(shift.durationMs)}</TableCell>
      <TableCell>
        <EndReasonBadge shift={shift} />
      </TableCell>
      <TableCell>
        {shift.nextStartedAtSameDay
          ? formatHm(shift.nextStartedAtSameDay)
          : "—"}
      </TableCell>
    </TableRow>
  );
}

function ShiftCard({ shift }: { shift: ShiftHistoryRow }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        shift.isOpen && "border-green-500/30 bg-green-500/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{shift.staffUsername}</span>
        <EndReasonBadge shift={shift} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Početak</dt>
        <dd>{formatHm(shift.startedAt)}</dd>
        <dt className="text-muted-foreground">Kraj</dt>
        <dd>{shift.endedAt ? formatHm(shift.endedAt) : "—"}</dd>
        <dt className="text-muted-foreground">Trajanje</dt>
        <dd>{formatShiftDuration(shift.durationMs)}</dd>
        <dt className="text-muted-foreground">Sledeća smena</dt>
        <dd>
          {shift.nextStartedAtSameDay
            ? formatHm(shift.nextStartedAtSameDay)
            : "—"}
        </dd>
      </dl>
    </div>
  );
}

function WorkerSummaryLine({
  summaries,
}: {
  summaries: ShiftHistoryDay["workerSummaries"];
}) {
  if (summaries.length === 0) return null;

  return (
    <p className="text-muted-foreground text-sm">
      {summaries.map((w, i) => (
        <span key={w.staffId}>
          {i > 0 && " · "}
          {w.staffUsername} {w.rangeStart}–{w.rangeEnd} ·{" "}
          {formatShiftDuration(w.totalDurationMs)}
        </span>
      ))}
    </p>
  );
}

function DaySection({ day }: { day: ShiftHistoryDay }) {
  const gapsByAfter = new Map<number, CoverageGap[]>();
  for (const gap of day.coverageGaps) {
    const list = gapsByAfter.get(gap.insertAfterIndex) ?? [];
    list.push(gap);
    gapsByAfter.set(gap.insertAfterIndex, list);
  }

  const hasShifts = day.shifts.length > 0;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{formatDayHeader(day.date)}</h2>
        <WorkerSummaryLine summaries={day.workerSummaries} />
      </div>

      {!hasShifts ? (
        <p className="text-muted-foreground py-4 text-center text-sm">
          Nema smena za izabrani dan.
        </p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Radnik</TableHead>
                  <TableHead>Početak</TableHead>
                  <TableHead>Kraj</TableHead>
                  <TableHead>Trajanje</TableHead>
                  <TableHead>Način završetka</TableHead>
                  <TableHead>Sledeća smena počela u</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(gapsByAfter.get(-1) ?? []).map((gap) => (
                  <CoverageRow key={`gap-before-${gap.from}`} gap={gap} />
                ))}
                {day.shifts.map((shift, i) => (
                  <Fragment key={shift.id}>
                    <ShiftTableRow shift={shift} />
                    {(gapsByAfter.get(i) ?? []).map((gap) => (
                      <CoverageRow
                        key={`gap-${shift.id}-${gap.from}`}
                        gap={gap}
                      />
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-3">
            {(gapsByAfter.get(-1) ?? []).map((gap) => (
              <CoverageCard key={`gap-before-${gap.from}`} gap={gap} />
            ))}
            {day.shifts.map((shift, i) => (
              <div key={shift.id} className="space-y-3">
                <ShiftCard shift={shift} />
                {(gapsByAfter.get(i) ?? []).map((gap) => (
                  <CoverageCard
                    key={`gap-${shift.id}-${gap.from}`}
                    gap={gap}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function SmeneClient({ days }: SmeneClientProps) {
  return (
    <div className="space-y-8">
      {days.map((day) => (
        <DaySection key={day.date} day={day} />
      ))}
    </div>
  );
}
