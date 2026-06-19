import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminOrNull } from "@/lib/auth/session";
import {
  businessToday,
  weekStartMonday,
} from "@/lib/time/business-day";
import { fetchShiftHistory } from "@/lib/shifts/queries";
import {
  formatBelgradeDateTime,
  formatShiftDuration,
  shiftEndReasonLabel,
} from "@/lib/shifts/format";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staff: z.string().uuid().optional(),
});

function csvEscape(value: string | number | boolean | null): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const adminStaff = await getAdminOrNull();
  if (!adminStaff) {
    return NextResponse.json({ error: "Nemate pristup." }, { status: 403 });
  }

  const parsed = querySchema.safeParse({
    date: req.nextUrl.searchParams.get("date") ?? businessToday(),
    staff: req.nextUrl.searchParams.get("staff") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Neispravni parametri." }, { status: 400 });
  }

  const { date, staff } = parsed.data;
  const weekStart = weekStartMonday(date);
  const days = await fetchShiftHistory(weekStart, staff);

  const header = [
    "Dan",
    "Radnik",
    "Početak",
    "Kraj",
    "Trajanje",
    "Način završetka",
  ].join(",");

  const lines: string[] = [];

  for (const day of days) {
    for (const shift of day.shifts) {
      const { label } = shiftEndReasonLabel(
        shift.endedReason,
        shift.isOpen,
      );
      lines.push(
        [
          csvEscape(day.date),
          csvEscape(shift.staffUsername),
          csvEscape(formatBelgradeDateTime(shift.startedAt)),
          csvEscape(
            shift.endedAt ? formatBelgradeDateTime(shift.endedAt) : "",
          ),
          csvEscape(formatShiftDuration(shift.durationMs)),
          csvEscape(label),
        ].join(","),
      );
    }
  }

  const csv = [header, ...lines].join("\n");
  const filename = `smene-${weekStart}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
