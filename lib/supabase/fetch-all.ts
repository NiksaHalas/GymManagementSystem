/** Rows requested per round trip (PostgREST max_rows, supabase/config.toml [api]). */
export const FETCH_ALL_PAGE_SIZE = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Reads every row of a query by paging with `.range()`.
 *
 * PostgREST caps each response at `max_rows` and truncates silently, so a plain
 * select over a month or a year of payments returns only the first 1000 rows.
 * Pages continue until an empty page, so a server cap lower than the page size
 * cannot cut the result short either. The query must have a stable order.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const from = rows.length;
    const { data, error } = await page(from, from + FETCH_ALL_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}
