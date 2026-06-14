import { businessToday, daysBetween } from "@/lib/time/business-day";
import type { MembershipSummary } from "@/lib/members/types";

export type MemberStatusKind = "active" | "expired" | "paused" | "none";

export interface MemberStatus {
  kind: MemberStatusKind;
  /** Serbian (latinica) label for the badge. */
  label: string;
  /** True when an active membership expires within the soon-to-expire window (<= 3 days). */
  soon: boolean;
  /** Days until end_date (negative when past); null when not applicable. */
  daysLeft: number | null;
}

/** Soon-to-expire threshold in days (PRD 3.13). */
export const SOON_TO_EXPIRE_DAYS = 3;

/**
 * Derives the display status of a member from their active/paused membership
 * summary, computed at read time (does not trust a stale stored enum alone).
 */
export function getMemberStatus(
  m: MembershipSummary | null,
  today: string = businessToday(),
): MemberStatus {
  if (!m || m.status === null) {
    return { kind: "none", label: "Nema članarine", soon: false, daysLeft: null };
  }

  if (m.status === "pauzirana") {
    return { kind: "paused", label: "Pauzirana", soon: false, daysLeft: null };
  }

  const daysLeft =
    m.endDate !== null ? daysBetween(today, m.endDate) : null;

  const dateExpired = daysLeft !== null && daysLeft < 0;
  const sessionsExpired = !m.isTimeBased && (m.sessionsLeft ?? 0) <= 0;

  if (dateExpired || sessionsExpired) {
    return { kind: "expired", label: "Istekla", soon: false, daysLeft };
  }

  const soon = daysLeft !== null && daysLeft <= SOON_TO_EXPIRE_DAYS;
  return { kind: "active", label: "Aktivna", soon, daysLeft };
}
