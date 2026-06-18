import { formatRsd } from "@/lib/members/format";

export { formatRsd };

/** Package meta badge text, e.g. "8 termina | 30 dana" or "Mesečna, neograničeno". */
export function formatPackageMeta(
  isTimeBased: boolean,
  sessions: number | null,
  durationDays: number,
): string {
  if (isTimeBased) {
    return "Mesečna, neograničeno";
  }
  const sessionPart =
    sessions === 1 ? "1 termin" : `${sessions ?? "—"} termina`;
  const dayPart = durationDays === 1 ? "1 dan" : `${durationDays} dana`;
  return `${sessionPart} | ${dayPart}`;
}

/**
 * Slug for a new training category code from its label.
 * Returns "" when the label has no alphanumeric content — the caller blocks
 * creation with a readable message instead of inventing a placeholder code.
 */
export function slugifyCategoryCode(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "dj")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}
