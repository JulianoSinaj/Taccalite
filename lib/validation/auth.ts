import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Inserisci il tuo nome").max(120),
  email: z.string().trim().toLowerCase().email("Email non valida"),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(200),
  phone: z
    .union([z.string().trim().max(40), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  marketingConsent: z.coerce.boolean().optional().default(false),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida"),
  password: z.string().min(1, "Inserisci la password"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
