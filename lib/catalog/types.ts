import type { MembershipType, Price, TrainingCategory } from "@/lib/db/types";

export type PriceWithEditor = Price & {
  updated_by_staff: { username: string } | null;
};

export type TypeWithPrices = MembershipType & {
  standard: PriceWithEditor | null;
  discount: PriceWithEditor | null;
};

export type CategoryWithTypes = TrainingCategory & {
  types: TypeWithPrices[];
};
