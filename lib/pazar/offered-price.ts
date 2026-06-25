import type { PaymentCatalog } from "@/lib/pazar/types";

export function offeredPriceForType(
  catalog: PaymentCatalog,
  membershipTypeId: number,
  discountFlag: boolean,
  categoryCode: string,
): { standard: number | null; offered: number | null } {
  for (const cat of catalog.categories) {
    for (const t of cat.types) {
      if (t.id !== membershipTypeId) continue;
      const standard = t.standard?.amount_rsd ?? null;
      const discount =
        discountFlag && categoryCode === "otvoreni"
          ? (t.discount?.amount_rsd ?? null)
          : null;
      return {
        standard,
        offered: discount ?? standard,
      };
    }
  }
  return { standard: null, offered: null };
}
