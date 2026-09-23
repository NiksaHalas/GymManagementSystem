import { describe, expect, it, vi } from "vitest";
import { FETCH_ALL_PAGE_SIZE, fetchAllRows } from "@/lib/supabase/fetch-all";

/** Fake PostgREST: serves `total` rows, never more than `cap` per response. */
function fakeTable(total: number, cap: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, Math.min(to + 1, from + cap)),
    error: null,
  }));
}

describe("fetchAllRows", () => {
  it("returns more rows than a single response allows", async () => {
    const page = fakeTable(3_581, FETCH_ALL_PAGE_SIZE);
    const rows = await fetchAllRows(page);
    expect(rows).toHaveLength(3_581);
    expect(rows.at(-1)).toEqual({ id: 3_580 });
  });

  it("still reads everything when the server cap is below the page size", async () => {
    const rows = await fetchAllRows(fakeTable(2_500, 400));
    expect(rows).toHaveLength(2_500);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2_500);
  });

  it("requests consecutive, non-overlapping ranges", async () => {
    const page = fakeTable(1_500, FETCH_ALL_PAGE_SIZE);
    await fetchAllRows(page);
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1_000, 1_999],
      [1_500, 2_499],
    ]);
  });

  it("returns an empty list for an empty result", async () => {
    expect(await fetchAllRows(fakeTable(0, FETCH_ALL_PAGE_SIZE))).toEqual([]);
  });

  it("surfaces query errors", async () => {
    const page = async () => ({ data: null, error: { message: "boom" } });
    await expect(fetchAllRows(page)).rejects.toThrow("boom");
  });
});
