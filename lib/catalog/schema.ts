import { z } from "zod";

export const upsertPriceSchema = z.object({
  membership_type_id: z.number().int().positive(),
  is_discount_price: z.boolean(),
  amount_rsd: z.number().int().positive("Cena mora biti veća od 0."),
});

export const createMembershipTypeSchema = z
  .object({
    training_category_id: z.number().int().positive().optional(),
    new_category: z
      .object({
        label: z.string().min(1, "Unesite naziv kategorije."),
        is_trainer_based: z.boolean(),
        per_trainee: z.boolean(),
      })
      .optional(),
    package: z.string().min(1, "Unesite paket."),
    label: z.string().min(1, "Unesite naziv."),
    is_time_based: z.boolean(),
    sessions: z.number().int().positive().nullable(),
    standard_price_rsd: z.number().int().positive("Standardna cena mora biti veća od 0."),
    discount_price_rsd: z.number().int().positive().nullable().optional(),
  })
  .refine((v) => v.training_category_id != null || v.new_category != null, {
    message: "Izaberite kategoriju ili kreirajte novu.",
  })
  .refine(
    (v) => v.is_time_based || (v.sessions != null && v.sessions > 0),
    { message: "Broj termina je obavezan za pakete po terminima.", path: ["sessions"] },
  );

export const updateMembershipTypeSchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1, "Unesite naziv."),
  is_time_based: z.boolean(),
  sessions: z.number().int().positive().nullable(),
});

export const toggleMembershipTypeActiveSchema = z.object({
  id: z.number().int().positive(),
  active: z.boolean(),
});

export const createTrainingCategorySchema = z.object({
  label: z.string().min(1, "Unesite naziv kategorije."),
  is_trainer_based: z.boolean(),
  per_trainee: z.boolean(),
});

export const updateTrainingCategorySchema = z.object({
  id: z.number().int().positive(),
  label: z.string().min(1, "Unesite naziv kategorije."),
  is_trainer_based: z.boolean(),
  per_trainee: z.boolean(),
});

export const toggleTrainingCategoryActiveSchema = z.object({
  id: z.number().int().positive(),
  active: z.boolean(),
});

export type UpsertPriceInput = z.infer<typeof upsertPriceSchema>;
export type CreateMembershipTypeInput = z.infer<typeof createMembershipTypeSchema>;
export type UpdateMembershipTypeInput = z.infer<typeof updateMembershipTypeSchema>;
export type CreateTrainingCategoryInput = z.infer<typeof createTrainingCategorySchema>;
export type UpdateTrainingCategoryInput = z.infer<typeof updateTrainingCategorySchema>;
