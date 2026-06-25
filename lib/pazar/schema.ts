import { z } from "zod";

export const recordPaymentSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  memberId: z.string().uuid(),
  membershipTypeId: z.number().int().positive().nullable(),
  amountRsd: z.number().int().min(0),
  isCustomPrice: z.boolean(),
  customReason: z.string().nullable(),
  startMode: z.enum(["payment", "first_visit"]),
  settleReservedIds: z.array(z.string().uuid()),
  checkinId: z.string().uuid().nullable(),
});

export const voidPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().trim().min(1, "Razlog je obavezan."),
});

export const editPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  amountRsd: z.number().int().positive("Iznos mora biti veći od 0."),
  customReason: z.string().nullable(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;
export type EditPaymentInput = z.infer<typeof editPaymentSchema>;
