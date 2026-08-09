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
    // Blank = fall back to the shop-wide low-stock threshold.
    reorderPoint: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => (v && v !== "" ? Number(v) : null))
      .refine((v) => v == null || (Number.isInteger(v) && v >= 0), "Soglia di riordino non valida"),
    costEuros: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => (v && v !== "" ? Math.round(Number(v) * 100) : null))
      .refine((v) => v == null || (Number.isFinite(v) && v >= 0), "Costo non valido"),
    sku: optionalText(60),
    supplier: optionalText(200),
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

export const manualOrderInput = z.object({
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .email("Email non valida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: optionalText(40),
  fulfilment: z.enum(["pickup", "shipping"]).default("pickup"),
  shopSlug: optionalText(80),
  address: optionalText(200),
  city: optionalText(120),
  zip: optionalText(20),
  discountCode: optionalText(40),
  notes: optionalText(1000),
  markPaid: checkbox,
});

export const reservationDepositInput = z.object({
  id: z.string().trim().min(1),
  depositEuros: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && v !== "" ? Math.round(Number(v) * 100) : 0))
    .refine((v) => Number.isFinite(v) && v >= 0, "Importo non valido"),
  paid: checkbox,
});

export const stockAdjustInput = z.object({
  productId: z.string().trim().min(1),
  delta: z.coerce.number().int().refine((v) => v !== 0, "Inserisci una variazione diversa da zero"),
  reason: optionalText(200),
});

export const reservationStatusInput = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["pending", "confirmed", "completed", "cancelled"]),
  adminNotes: optionalText(2000),
});

/**
 * The bookable details of a reservation, shared by the back-office create and
 * reschedule forms.
 *
 * Deliberately laxer than the public `reservationSchema`: an operator taking a
 * booking at the counter may not have every detail to hand, and the per-type
 * requirements below are the ones that actually matter operationally (a date to
 * put it on, and kg for a porchetta order so capacity still adds up).
 */
const reservationDetailFields = {
  type: z.enum(["table", "porchetta", "order"]).default("table"),
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(120),
  phone: z.string().trim().min(1, "Il telefono è obbligatorio").max(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .email("Email non valida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  shopSlug: z.string().trim().min(1, "Scegli un negozio"),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  time: optionalText(5),
  guests: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && v !== "" ? Number(v) : null))
    .refine((v) => v == null || (Number.isInteger(v) && v >= 1 && v <= 100), "Numero ospiti non valido"),
  quantityKg: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && v !== "" ? Number(v) : null))
    .refine((v) => v == null || (Number.isFinite(v) && v > 0 && v <= 200), "Quantità non valida"),
  notes: optionalText(2000),
};

/** Per-type requirements applied to both create and reschedule. */
const requireByType = (
  d: { type: string; quantityKg: number | null },
  ctx: z.RefinementCtx,
) => {
  if (d.type === "porchetta" && d.quantityKg == null) {
    ctx.addIssue({ code: "custom", message: "Indica i kg di porchetta", path: ["quantityKg"] });
  }
};

export const reservationCreateInput = z
  .object({
    ...reservationDetailFields,
    // A booking taken by staff is already agreed with the customer.
    status: z.enum(["pending", "confirmed"]).default("confirmed"),
    notifyCustomer: checkbox,
    adminNotes: optionalText(2000),
  })
  .superRefine(requireByType);

export const reservationDetailsInput = z
  .object({
    id: z.string().trim().min(1),
    ...reservationDetailFields,
    notifyCustomer: checkbox,
  })
  .superRefine(requireByType);

/**
 * Contact / delivery details of an existing order. Money (lines, coupon) is out
 * of scope here — changing `fulfilment` does move the shipping fee, so the
 * action re-runs the pricing rules afterwards for orders that aren't yet paid.
 */
export const orderDetailsInput = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .email("Email non valida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: optionalText(40),
  fulfilment: z.enum(["pickup", "shipping"]),
  shopSlug: optionalText(80),
  address: optionalText(200),
  city: optionalText(120),
  zip: optionalText(20),
  notes: optionalText(1000),
  internalNotes: optionalText(2000),
});

/**
 * Buyer fiscal identity for the electronic invoice.
 *
 * Separate from `orderDetailsInput` on purpose: this is invoicing metadata, not
 * order content. It moves no money, and it is usually collected *after* the
 * sale is paid — exactly when the rest of the order is frozen — so it has its
 * own action with its own (looser) rule about when it can be edited.
 * Values are normalised in the XML builder; kept permissive here so a
 * partially-known identity can still be saved.
 */
export const orderFiscalInput = z.object({
  id: z.string().trim().min(1),
  customerTaxCode: optionalText(20),
  customerVatNumber: optionalText(20),
  customerSdiCode: optionalText(10),
  customerPec: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .email("PEC non valida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
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

/** Editable contact details of an account. `username` and `role` are deliberately
 *  out of scope here — they have their own guarded actions. A cleared email is
 *  stored as NULL so it doesn't collide with the unique index. */
export const userProfileInput = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .email("Email non valida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: optionalText(40),
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
