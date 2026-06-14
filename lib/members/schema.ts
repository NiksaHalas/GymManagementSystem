import { z } from "zod";

export const memberFormSchema = z.object({
  first_name: z.string().trim().min(1, "Obavezno polje.").max(80),
  last_name: z.string().trim().min(1, "Obavezno polje.").max(80),
  phone: z
    .string()
    .trim()
    .min(3, "Unesite broj telefona.")
    .max(40)
    .regex(/^[0-9+()/\s-]+$/, "Neispravan broj telefona."),
  discount_flag: z.boolean(),
  comment: z.string().trim().max(1000).optional().or(z.literal("")),
});

export type MemberFormValues = z.infer<typeof memberFormSchema>;

/** Strips non-digits for duplicate-phone comparison. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
