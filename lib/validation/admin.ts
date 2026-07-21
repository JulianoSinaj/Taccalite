import { z } from "zod";
import { ActionError } from "@/lib/admin/action-state";

/** Checkbox → boolean ("on"/"true" = checked). */
const checkbox = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => v === "on" || v === "true");

/** Optional trimmed string that becomes undefined when blank. */
const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(/^[a-z0-9-]*$/, "Slug non valido (solo lettere minuscole, numeri e trattini)");

export const productInput = z
  .object({
    id: optionalText(40),
    name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
    slug: slug.optional(),
    shopSlug: z.string().trim().min(1, "Scegli un negozio"),
    category: optionalText(120),
    description: optionalText(4000),
    imageLabel: optionalText(200),
    image: optionalText(1000),
    priceEuros: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => (v && v !== "" ? Math.round(Number(v) * 100) : null))
      .refine((v) => v == null || (Number.isFinite(v) && v >= 0), "Prezzo non valido"),
    unit: optionalText(40),
    // VAT rate posted as a percent (e.g. "10"), stored as basis points (1000).
    vatRate: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => (v != null && v !== "" ? Math.round(Number(v) * 100) : 1000))
      .refine((v) => Number.isFinite(v) && v >= 0 && v <= 10000, "Aliquota IVA non valida"),
    soldByWeight: checkbox,
    allergens: optionalText(600),
    origin: optionalText(300),
    ingredients: optionalText(4000),
    stock: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => (v && v !== "" ? Number(v) : null))
      .refine((v) => v == null || (Number.isInteger(v) && v >= 0), "Giacenza non valida"),
    purchasable: checkbox,
    featured: checkbox,
    active: checkbox,
    sortOrder: z.coerce.number().int().default(0),
  })
  // A product sold online must carry a real price: enforce a positive price when
  // `purchasable` is on. Non-purchasable products keep the optional price.
  .superRefine((d, ctx) => {
    if (d.purchasable && !(typeof d.priceEuros === "number" && d.priceEuros > 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Indica un prezzo maggiore di zero per i prodotti acquistabili online",
        path: ["priceEuros"],
      });
    }
  });

export const blogInput = z.object({
  id: optionalText(40),
  title: z.string().trim().min(1, "Il titolo è obbligatorio").max(300),
  slug: slug.optional(),
  date: optionalText(20),
  category: optionalText(120),
  excerpt: optionalText(1000),
  content: optionalText(20000),
  imageLabel: optionalText(200),
  image: optionalText(1000),
  published: checkbox,
  sortOrder: z.coerce.number().int().default(0),
});

export const shopInput = z.object({
  id: optionalText(40),
  slug: slug.optional(),
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  specialty: optionalText(200),
  tagline: optionalText(300),
  description: optionalText(4000),
  address: optionalText(300),
  phone: optionalText(60),
  email: optionalText(200),
  hours: optionalText(2000),
  highlights: optionalText(2000),
  image: optionalText(1000),
  imageLabel: optionalText(200),
  addressConfirmed: checkbox,
  hoursConfirmed: checkbox,
  reservationsEnabled: checkbox,
  storeEnabled: checkbox,
  porchettaEnabled: checkbox,
  sortOrder: z.coerce.number().int().default(0),
});

export const rewardInput = z.object({
  id: optionalText(40),
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  slug: slug.optional(),
  description: optionalText(2000),
  points: z.coerce.number().int().min(0, "I punti devono essere ≥ 0"),
  image: optionalText(1000),
  active: checkbox,
  sortOrder: z.coerce.number().int().default(0),
});

export const discountInput = z.object({
  id: optionalText(40),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Il codice deve avere almeno 2 caratteri")
    .max(40)
    .regex(/^[A-Z0-9._-]+$/, "Codice non valido (solo lettere, numeri, . _ -)"),
  type: z.enum(["percent", "fixed", "free_shipping"]),
  // Meaning depends on `type`: percent → whole percent; fixed → euros; ignored for
  // free_shipping. The action converts to the stored integer form.
  value: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && v !== "" ? Number(v) : 0))
    .refine((v) => Number.isFinite(v) && v >= 0, "Valore non valido"),
  minSubtotalEuros: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && v !== "" ? Math.round(Number(v) * 100) : 0))
    .refine((v) => Number.isFinite(v) && v >= 0, "Importo minimo non valido"),
  maxRedemptions: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && v !== "" ? Number(v) : null))
    .refine((v) => v == null || (Number.isInteger(v) && v >= 1), "Limite non valido"),
  startsAt: optionalText(20),
  endsAt: optionalText(20),
  active: checkbox,
});

export const reservationStatusInput = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["pending", "confirmed", "completed", "cancelled"]),
  adminNotes: optionalText(2000),
});

export const orderStatusInput = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["pending", "paid", "fulfilled", "cancelled", "refunded"]),
  paymentStatus: z.enum(["unpaid", "paid", "refunded"]).optional(),
});

export const redemptionStatusInput = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["pending", "fulfilled", "cancelled"]),
});

export const pointsInput = z.object({
  userId: z.string().trim().min(1),
  delta: z.coerce.number().int().refine((v) => v !== 0, "Inserisci un valore diverso da zero"),
  reason: optionalText(200),
});

export const settingInput = z.object({
  key: z.string().trim().min(1).max(120),
  value: z.string(),
  // When "text", the value is stored verbatim as a string (never JSON-parsed) so
  // numeric-looking text like a Partita IVA keeps its leading zeros and type.
  valueType: z.enum(["json", "text"]).optional(),
});

export const userRoleInput = z.object({
  id: z.string().trim().min(1),
  role: z.enum(["customer", "staff", "admin"]),
});

export const userPasswordInput = z.object({
  id: z.string().trim().min(1),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(200),
});

/** Parse a FormData through a schema, throwing the first message on failure.
 *  Throws `ActionError` so `runAction` surfaces the (user-facing) validation
 *  message to the form instead of genericizing it. */
export function parseForm<T extends z.ZodTypeAny>(schema: T, fd: FormData): z.infer<T> {
  const obj = Object.fromEntries(fd.entries());
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw new ActionError(result.error.issues[0]?.message ?? "Dati non validi");
  }
  return result.data;
}
