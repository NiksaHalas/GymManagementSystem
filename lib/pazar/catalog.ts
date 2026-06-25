import "server-only";

import { getServerSupabase } from "@/lib/supabase/server-client";
import type {
  MembershipType,
  Price,
  TrainingCategory,
} from "@/lib/db/types";
import type { CategoryWithTypes, TypeWithPrices } from "@/lib/catalog/types";
import { sortMembershipTypes } from "@/lib/catalog/sort";
import type { PaymentCatalog } from "@/lib/pazar/types";

type PriceRow = Price;

function toTypeWithPrices(t: MembershipType, pp: { standard: PriceRow | null; discount: PriceRow | null }): TypeWithPrices {
  return {
    ...t,
    standard: pp.standard ? { ...pp.standard, updated_by_staff: null } : null,
    discount: pp.discount ? { ...pp.discount, updated_by_staff: null } : null,
  };
}

function assembleCatalogCategoryWithTypes(
  categories: TrainingCategory[],
  types: MembershipType[],
  prices: PriceRow[],
): CategoryWithTypes[] {
  const priceByType = new Map<
    number,
    { standard: PriceRow | null; discount: PriceRow | null }
  >();

  for (const p of prices) {
    if (!p.active) continue;
    const entry = priceByType.get(p.membership_type_id) ?? {
      standard: null,
      discount: null,
    };
    if (p.is_discount_price) entry.discount = p;
    else entry.standard = p;
    priceByType.set(p.membership_type_id, entry);
  }

  return categories
    .filter((c) => c.active)
    .map((cat) => {
      const catTypes = sortMembershipTypes(
        types
          .filter((t) => t.training_category_id === cat.id && t.active)
          .map((t) => toTypeWithPrices(t, priceByType.get(t.id) ?? { standard: null, discount: null })),
      );

      return { ...cat, types: catTypes };
    });
}

export async function fetchPaymentCatalog(): Promise<PaymentCatalog> {
  const supabase = await getServerSupabase();

  const [categoriesRes, typesRes, pricesRes] = await Promise.all([
    supabase
      .from("training_category")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("membership_type").select("*").eq("active", true).order("package"),
    supabase.from("price").select("*").eq("active", true),
  ]);

  if (categoriesRes.error) throw new Error(categoriesRes.error.message);
  if (typesRes.error) throw new Error(typesRes.error.message);
  if (pricesRes.error) throw new Error(pricesRes.error.message);

  return {
    categories: assembleCatalogCategoryWithTypes(
      categoriesRes.data as TrainingCategory[],
      typesRes.data as MembershipType[],
      pricesRes.data as PriceRow[],
    ),
  };
}

export { offeredPriceForType } from "@/lib/pazar/offered-price";
