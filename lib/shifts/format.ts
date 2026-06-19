import { addDays } from "@/lib/time/business-day";

const BELGRADE_TZ = "Europe/Belgrade";

export const GYM_OPEN = "09:00";

export function gymCloseTime(dateIso: string): "21:00" | "18:00" | "16:00" {
  const d = Date.parse(`${dateIso}T00:00:00Z`);
  const day = new Date(d).getUTCDay();
  if (day === 0) return "16:00";
  if (day === 6) return "18:00";
  return "21:00";
}

export function formatHm(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("sr-RS", {
    timeZone: BELGRADE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

export function formatShiftDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}č`;
  return `${hours}č ${minutes}m`;
}

export function shiftEndReasonLabel(
  reason: string | null,
  isOpen: boolean,
): { label: string; tone: string; tooltip?: string } {
  if (isOpen) {
    return {
      label: "U toku",
      tone:
        "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
    };
  }

  switch (reason) {
    case "logout":
      return {
        label: "Završena ručno",
        tone: "border-border bg-secondary text-secondary-foreground",
      };
    case "switch":
      return {
        label: "Zamena radnika",
        tone:
          "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
      };
    case "auto_close":
      return {
        label: "Auto-zatvaranje",
        tone:
          "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-400",
        tooltip:
          "Verovatno zaboravljena odjava — kraj postavljen na vreme zatvaranja",
      };
    case "inactivity":
      return {
        label: "Neaktivnost",
        tone:
          "border-orange-500/40 bg-orange-500/10 text-orange-800 dark:text-orange-400",
      };
    default:
      return {
        label: "—",
        tone: "border-border text-muted-foreground",
      };
  }
}

/** Belgrade local datetime for CSV export (`YYYY-MM-DD HH:MM`). */
export function formatBelgradeDateTime(instant: Date | string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: BELGRADE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return `${date} ${formatHm(d)}`;
}

export function formatWeekdayLong(dateIso: string): string {
  return new Intl.DateTimeFormat("sr-RS", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(`${dateIso}T12:00:00Z`));
}

export function formatDayHeader(dateIso: string): string {
  const [y, m, d] = dateIso.split("-");
  return `${formatWeekdayLong(dateIso)}, ${d}.${m}.${y}.`;
}

export function formatWeekRangeLabel(weekStart: string): string {
  const endIso = addDays(weekStart, 6);

  const fmt = (iso: string) => {
    const [, mm, dd] = iso.split("-");
    return `${dd}.${mm}`;
  };

  return `${fmt(weekStart)} – ${fmt(endIso)}`;
}
