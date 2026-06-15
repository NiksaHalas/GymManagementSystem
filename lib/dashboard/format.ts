import { formatFullName, formatMemberNo, formatRsd } from "@/lib/members/format";
import type { DashboardCheckinRow, KeyHolder } from "@/lib/dashboard/types";

export function formatCheckinDisplayName(row: DashboardCheckinRow): string {
  if (row.isFitpass) {
    return row.isGroupFitpass ? "Fitpass (grupni)" : "Fitpass";
  }
  return formatFullName(row.firstName ?? "", row.lastName ?? "");
}

export function formatKeyHolder(holder: KeyHolder): string {
  if (holder.isFitpass) return "Fitpass";
  if (!holder.firstName && !holder.lastName) return "—";
  const name = formatFullName(holder.firstName ?? "", holder.lastName ?? "");
  if (holder.memberNo != null) {
    return `${name} (${formatMemberNo(holder.memberNo)})`;
  }
  return name;
}

export function formatPaymentBadge(
  payment: DashboardCheckinRow["paymentToday"],
): string | null {
  if (!payment) return null;
  const label = payment.membershipLabel ?? payment.kind;
  return `${label} · ${formatRsd(payment.amountRsd)}`;
}

/** ISO date shift by N days (UTC midnight math). */
export function shiftBusinessDate(iso: string, deltaDays: number): string {
  const d = Date.parse(`${iso}T00:00:00Z`);
  return new Date(d + deltaDays * 86_400_000).toISOString().slice(0, 10);
}
