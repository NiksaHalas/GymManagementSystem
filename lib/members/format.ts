/** Displays a member number, or a dash placeholder when not yet assigned (offline-pending). */
export function formatMemberNo(memberNo: number | null): string {
  return memberNo === null ? "—" : String(memberNo);
}

/** Full name "First Last". */
export function formatFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/** Formats an ISO date (`YYYY-MM-DD` or full timestamp) as `dd.MM.yyyy.` (Serbian). */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const datePart = iso.slice(0, 10);
  const ms = Date.parse(`${datePart}T00:00:00Z`);
  if (Number.isNaN(ms)) return "—";
  const d = new Date(ms);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}.${month}.${year}.`;
}

/** Formats an integer amount of RSD, e.g. 2500 -> "2.500 RSD". */
export function formatRsd(amount: number): string {
  return `${new Intl.NumberFormat("sr-RS").format(amount)} RSD`;
}
