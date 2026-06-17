import type { PaymentKind } from "@/lib/db/types";

const KIND_LABELS: Record<PaymentKind, string> = {
  membership: "Članarina",
  debt_settlement: "Izmirenje duga",
  fitpass_surcharge: "Fitpass doplata",
};

export function paymentKindLabel(kind: PaymentKind): string {
  return KIND_LABELS[kind];
}

export { formatDate, formatRsd } from "@/lib/members/format";
