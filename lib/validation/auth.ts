import { z } from "zod";

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Lo username deve avere almeno 3 caratteri")
  .max(40, "Lo username è troppo lungo")
  .regex(/^[a-z0-9._-]+$/, "Usa solo lettere, numeri, punto, trattino o underscore");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Inserisci il tuo nome").max(120),
  username,
  email: z
    .union([z.string().trim().toLowerCase().email("Email non valida"), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(200),
  phone: z
    .union([z.string().trim().max(40), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  marketingConsent: z.coerce.boolean().optional().default(false),
});

export const loginSchema = z.object({
  username,
  password: z.string().min(1, "Inserisci la password"),
  // Optional TOTP code, supplied on the second step when 2FA is enabled.
  code: z
    .union([z.string().trim().max(10), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
