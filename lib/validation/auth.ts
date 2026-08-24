import { z } from "zod";

/**
 * The legacy handle. Kept because `users.username` is NOT NULL UNIQUE and
 * dropping it would mean rebuilding a table that carries an FTS5 index (see the
 * note on the `users` table in `lib/db/schema.ts`).
 *
 * New self-service signups no longer choose one — it is derived from the email
 * local part by `deriveUsername` in `lib/auth/service.ts`. The charset here is
 * what that derivation targets, and what accounts created before the email-first
 * switch already satisfy.
 */
const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Lo username deve avere almeno 3 caratteri")
  .max(40, "Lo username è troppo lungo")
  .regex(/^[a-z0-9._-]+$/, "Usa solo lettere, numeri, punto, trattino o underscore");

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Inserisci la tua email")
  .max(200, "L'email è troppo lunga")
  .email("Email non valida");

/**
 * Password rules, deliberately short.
 *
 * Length is the only requirement that survives contact with real users; forced
 * symbol/digit classes push people to "Password1!" and to writing it on the till.
 * The 200-char ceiling is a denial-of-service guard, not a policy — scrypt at
 * N=2^16 is expensive enough that an unbounded input is a free CPU burn.
 */
const password = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri")
  .max(200, "La password è troppo lunga");

/**
 * Optional free-text phone, normalised so "" reads as absent.
 *
 * `.optional()` comes LAST on purpose. With it inside (`.optional().transform()`)
 * zod infers a required key of type `string | undefined`, so every caller —
 * including tests — has to pass the key explicitly even when there is nothing to
 * pass. Wrapping the transform makes the key itself optional.
 */
const optionalPhone = z
  .union([z.string().trim().max(40), z.literal("")])
  .transform((v) => (v ? v : undefined))
  .optional();

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Inserisci il tuo nome").max(120),
  // Required as of the email-first switch: an account with no address cannot be
  // recovered, and recovery is the whole point. Counter-created accounts take
  // the separate `staffCustomerInput` path in `lib/validation/admin.ts`, which
  // still allows phone-only.
  email,
  password,
  phone: optionalPhone,
  marketingConsent: z.coerce.boolean().optional().default(false),
  // Accepted but no longer asked for by the public form. Kept so an existing
  // client (or a script) that still sends one keeps working.
  username: username.optional(),
});

export const loginSchema = z.object({
  /**
   * Email or legacy username. Resolved by `loginUser`: anything containing "@"
   * is looked up as an address, everything else as a handle. Not validated
   * against either charset — a rejected *shape* would tell an attacker which
   * identifiers are worth trying, and the lookup fails safely regardless.
   */
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Inserisci email o username")
    .max(200),
  password: z.string().min(1, "Inserisci la password"),
  // Optional second-factor input, supplied on the second step when 2FA is
  // enabled. Either a 6-digit TOTP code or a recovery code ("A7K2M-9PQXT"),
  // hence the wider bound and the non-numeric charset.
  code: z
    .union([z.string().trim().max(20), z.literal("")])
    .transform((v) => (v ? v : undefined))
    .optional(),
});

/** "I forgot my password" — takes only the address the link should go to. */
export const passwordResetRequestSchema = z.object({ email });

/** Redeeming the emailed link. */
export const passwordResetSchema = z.object({
  token: z.string().trim().min(1).max(200),
  password,
});

/** Changing a password from inside the account area. */
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Inserisci la password attuale"),
  password,
});

/** Editing one's own contact details. */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "Inserisci il tuo nome").max(120),
  email,
  phone: optionalPhone,
});

/** Re-sending a verification link to an address that hasn't proven itself. */
export const emailResendSchema = z.object({ email });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;
