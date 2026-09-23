import { describe, expect, it } from "vitest";
import { offeredPriceForType } from "@/lib/pazar/offered-price";
import type { PaymentCatalog } from "@/lib/pazar/types";

const catalog = {
  categories: [
    {
      code: "otvoreni",
      types: [
        { id: 17, standard: { amount_rsd: 3200 }, discount: { amount_rsd: 2700 } },
        { id: 14, standard: { amount_rsd: 450 }, discount: null },
      ],
    },
    {
      code: "kardio",
      types: [
        { id: 18, standard: { amount_rsd: 2600 }, discount: { amount_rsd: 2000 } },
      ],
    },
  ],
} as unknown as PaymentCatalog;

describe("offeredPriceForType", () => {
  it("offers the discount price to discount members on Otvoreni", () => {
    expect(offeredPriceForType(catalog, 17, true, "otvoreni")).toEqual({
      standard: 3200,
      offered: 2700,
    });
  });

  it("offers the standard price to members without the discount flag", () => {
    expect(offeredPriceForType(catalog, 17, false, "otvoreni")).toEqual({
      standard: 3200,
      offered: 3200,
    });
  });

  it("falls back to standard when an Otvoreni type has no discount row", () => {
    expect(offeredPriceForType(catalog, 14, true, "otvoreni").offered).toBe(450);
  });

  it("never applies a discount outside the Otvoreni category", () => {
    expect(offeredPriceForType(catalog, 18, true, "kardio").offered).toBe(2600);
  });

  it("returns nulls for an unknown membership type", () => {
    expect(offeredPriceForType(catalog, 999, false, "otvoreni")).toEqual({
      standard: null,
      offered: null,
    });
  });
});
