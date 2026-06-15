import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type {
  CategoryWithTypes,
  TypeWithPrices,
} from "@/lib/catalog/types";
import type {
  MembershipType,
  Price,
  TrainingCategory,
} from "@/lib/db/types";
import { CeneClient } from "./cene-client";

export const metadata = {
  title: "Cene — Teretana",
};

type PriceRow = Price & {
  updated_by_staff: { username: string } | null;
};

function assembleCatalog(
  categories: TrainingCategory[],
  types: MembershipType[],
  prices: PriceRow[],
  isAdmin: boolean,
): CategoryWithTypes[] {
  const priceByType = new Map<number, { standard: PriceRow | null; discount: PriceRow | null }>();

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
    .filter((c) => c.active || isAdmin)
    .map((cat) => {
      const catTypes = types
        .filter((t) => t.training_category_id === cat.id)
        .filter((t) => t.active || isAdmin)
        .map((t): TypeWithPrices => {
          const pp = priceByType.get(t.id);
          return {
            ...t,
            standard: pp?.standard ?? null,
            discount: pp?.discount ?? null,
          };
        });

      return { ...cat, types: catTypes };
    });
}

export default async function CenePage() {
  const staff = await requireUser();
  const isAdmin = staff.role === "admin";
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [categoriesRes, typesRes, pricesRes] = await Promise.all([
    supabase
      .from("training_category")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase.from("membership_type").select("*").order("package"),
    supabase
      .from("price")
      .select("*, updated_by_staff:staff(username)")
      .eq("active", true),
  ]);

  if (categoriesRes.error) throw new Error(categoriesRes.error.message);
  if (typesRes.error) throw new Error(typesRes.error.message);
  if (pricesRes.error) throw new Error(pricesRes.error.message);

  const categories = (categoriesRes.data ?? []) as TrainingCategory[];
  const types = (typesRes.data ?? []) as MembershipType[];
  const prices = (pricesRes.data ?? []) as PriceRow[];

  const catalog = assembleCatalog(categories, types, prices, isAdmin);

  return (
    <CeneClient
      categories={catalog}
      allCategories={categories}
      isAdmin={isAdmin}
    />
  );
}
