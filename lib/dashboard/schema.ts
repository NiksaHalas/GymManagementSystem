import { z } from "zod";

export const memberCheckinSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  memberId: z.string().uuid(),
  keyNo: z.number().int().min(1).max(22).nullable(),
  withTrainer: z.boolean(),
  trainingCategoryId: z.number().int().positive().nullable(),
  trainerId: z.string().uuid().nullable(),
  allowExpiredOverride: z.boolean().optional(),
});

export type MemberCheckinInput = z.infer<typeof memberCheckinSchema>;

export const fitpassCheckinSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  keyNo: z.number().int().min(1).max(22),
  isGroupFitpass: z.boolean(),
});

export type FitpassCheckinInput = z.infer<typeof fitpassCheckinSchema>;

export const updateCheckinKeySchema = z.object({
  checkinId: z.string().uuid(),
  keyNo: z.number().int().min(1).max(22).nullable(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type UpdateCheckinKeyInput = z.infer<typeof updateCheckinKeySchema>;

export const checkinIdSchema = z.object({
  checkinId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
