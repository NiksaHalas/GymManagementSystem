/**
 * Catalog ordering for membership packages within a training category.
 *
 * Session-based packages come first, ascending by session count (1/1, 8/1,
 * 12/1, …); time-based packages (sessions = null, e.g. Open type / Cardio
 * 30/1) sort last. Ties break on the package code. This matches the PRD §4
 * price-list ordering, where 30/1 — the time-based monthly — is listed last.
 *
 * Replaces a plain `.order("package")`, which sorted lexicographically and put
 * "8/1" after "30/1".
 */
type SortableType = {
  sessions: number | null;
  package: string;
};

export function compareMembershipType(a: SortableType, b: SortableType): number {
  const aNull = a.sessions == null;
  const bNull = b.sessions == null;
  if (aNull !== bNull) return aNull ? 1 : -1;
  if (!aNull && !bNull && a.sessions !== b.sessions) {
    return (a.sessions as number) - (b.sessions as number);
  }
  return a.package.localeCompare(b.package);
}

/** Returns a new array of membership types in catalog order. */
export function sortMembershipTypes<T extends SortableType>(types: T[]): T[] {
  return [...types].sort(compareMembershipType);
}
