import { z } from "zod";
import { ActionError } from "@/lib/admin/action-state";
import { FULFILMENT_MODES } from "@/lib/fulfilment";
import { SETTLEMENT_INSTRUMENTS } from "@/lib/payments/methods";

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

/** Optional non-negative integer from a form field; blank → null. */
const optionalCount = (message: string, max = 1_000_000) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v != null && v !== "" ? Number(v) : null))
    .refine((v) => v == null || (Number.isInteger(v) && v >= 0 && v <= max), message);

/** Optional euros field stored as integer cents; blank → null. */
const optionalEuros = (message: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v != null && v !== "" ? Math.round(Number(String(v).replace(",", ".")) * 100) : null))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0), message);

/** Optional `yyyy-mm-dd` (or `datetime-local`) parsed to a Date; blank → null. */
const optionalDate = (message: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v != null && v !== "" ? new Date(v) : null))
    .refine((v) => v == null || !Number.isNaN(v.getTime()), message);

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
    // The form posts the category *id*; the action reads the row and writes the
    // denormalised `category` name alongside it. `category` stays accepted for
    // the CSV importer, which matches on the name it finds in the file.
    categoryId: optionalText(40),
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

export const categoryInput = z.object({
  id: optionalText(40),
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(120),
  slug: slug.optional(),
  kind: z.enum(["product", "post"], { message: "Tipo di categoria non valido" }),
  // "" (the empty <select> option) means "no parent", not "parent with id ''".
  parentId: optionalText(40),
  // Blank = no default; the product form then keeps its own.
  defaultVatRate: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v != null && v !== "" ? Math.round(Number(v) * 100) : null))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0 && v <= 10000), "Aliquota IVA non valida"),
  accent: optionalText(40),
  description: optionalText(2000),
  image: optionalText(1000),
  seoTitle: optionalText(200),
  seoDescription: optionalText(400),
  sortOrder: z.coerce.number().int().default(0),
  active: checkbox,
});

/** Fold one category into another — the cleanup tool for a typo that forked the
 *  catalogue. Both ids are required; the source is deleted once emptied. */
export const categoryMergeInput = z.object({
  sourceId: z.string().trim().min(1, "Categoria di origine mancante"),
  targetId: z.string().trim().min(1, "Scegli la categoria di destinazione"),
});

export const blogInput = z.object({
  id: optionalText(40),
  title: z.string().trim().min(1, "Il titolo è obbligatorio").max(300),
  slug: slug.optional(),
  date: optionalText(20),
  categoryId: optionalText(40),
  category: optionalText(120),
  excerpt: optionalText(1000),
  content: optionalText(20000),
  imageLabel: optionalText(200),
  image: optionalText(1000),
  seoTitle: optionalText(70),
  seoDescription: optionalText(200),
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
  // Per-location capacity. Blank falls back to the shop-wide setting (porchetta)
  // or means "no limit" (seats).
  porchettaCapacityKg: optionalCount("Capacità porchetta non valida", 10_000),
  seatsCapacity: optionalCount("Numero di coperti non valido", 1_000),
  /** Structured weekly hours, posted as JSON by the hours editor. */
  hoursStructured: optionalText(4000),
  sortOrder: z.coerce.number().int().default(0),
});

export const rewardInput = z
  .object({
    id: optionalText(40),
    name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
    slug: slug.optional(),
    description: optionalText(2000),
    points: z.coerce.number().int().min(0, "I punti devono essere ≥ 0"),
    image: optionalText(1000),
    stock: optionalCount("Disponibilità non valida"),
    maxPerCustomer: optionalCount("Limite per cliente non valido", 1000),
    availableFrom: optionalDate("Data di inizio non valida"),
    availableUntil: optionalDate("Data di fine non valida"),
    active: checkbox,
    sortOrder: z.coerce.number().int().default(0),
  })
  .superRefine((d, ctx) => {
    if (d.availableFrom && d.availableUntil && d.availableUntil < d.availableFrom) {
      ctx.addIssue({
        code: "custom",
        message: "La data di fine non può precedere quella di inizio",
        path: ["availableUntil"],
      });
    }
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
  maxPerCustomer: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && v !== "" ? Number(v) : null))
    .refine((v) => v == null || (Number.isInteger(v) && v >= 1), "Limite per cliente non valido"),
  firstOrderOnly: checkbox,
  shopSlug: optionalText(80),
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
  fulfilment: z.enum(FULFILMENT_MODES).default("pickup"),
  shopSlug: optionalText(80),
  /** Pickup window as `yyyy-mm-ddTHH:MM`; blank = none (or none configured). */
  pickupSlot: optionalText(20),
  /** The `order`-type booking this sale was rung up from, when there is one. */
  reservationId: optionalText(40),
  address: optionalText(200),
  city: optionalText(120),
  zip: optionalText(20),
  discountCode: optionalText(40),
  /** A negotiated reduction the operator applies at the counter, in euros. It
   *  adds to any coupon and is apportioned across VAT rates exactly like one. */
  manualDiscountEuros: optionalEuros("Sconto manuale non valido"),
  /** Overrides the computed shipping fee when set (blank = use the rules). */
  shippingEuros: optionalEuros("Spese di spedizione non valide"),
  notes: optionalText(1000),
  markPaid: checkbox,
  /** How the counter sale was settled. Only meaningful with `markPaid`; it is
   *  what the invoice's ModalitaPagamento is derived from, so contanti and POS
   *  are not interchangeable. */
  paidWith: z.enum(SETTLEMENT_INSTRUMENTS).default("cash"),
});

/**
 * Register a payment taken outside Stripe — the customer paid at the counter, or
 * handed the money to the driver. The instrument is required rather than
 * defaulted, because it ends up on a fiscal document.
 */
export const orderSettleInput = z.object({
  id: z.string().trim().min(1),
  paidWith: z.enum(SETTLEMENT_INSTRUMENTS),
});

// ── Fulfilment: delivery zones & pickup windows ──────────────────────────────

/**
 * A serving area. `postcodes` is typed as free text — one CAP or prefix per line,
 * or comma-separated — because that is how an operator has the list: copied off a
 * courier's price sheet, not entered one field at a time.
 */
export const deliveryZoneInput = z.object({
  id: optionalText(40),
  name: z.string().trim().min(1, "Il nome della zona è obbligatorio").max(120),
  mode: z.enum(["delivery", "shipping"]),
  postcodes: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) =>
      String(v ?? "")
        .split(/[\s,;]+/)
        .map((c) => c.replace(/\D+/g, "").slice(0, 5))
        .filter(Boolean)
        // A CAP listed twice is not two rules.
        .filter((c, i, all) => all.indexOf(c) === i),
    ),
  shopSlug: optionalText(80),
  feeEuros: optionalEuros("Costo non valido"),
  freeOverEuros: optionalEuros("Soglia non valida"),
  minOrderEuros: optionalEuros("Ordine minimo non valido"),
  perKgEuros: optionalEuros("Supplemento al kg non valido"),
  leadTimeHours: optionalCount("Preavviso non valido", 720),
  note: optionalText(300),
  sortOrder: optionalCount("Ordine non valido", 9999),
  active: checkbox,
});

/** `HH:MM`, the way both the schedule and `shops.hoursStructured` write times. */
const clockTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido (usa il formato 09:30)");

export const pickupSlotInput = z
  .object({
    id: optionalText(40),
    shopSlug: z.string().trim().min(1, "Scegli una sede"),
    weekday: z
      .union([z.string(), z.number()])
      .transform((v) => Number(v))
      .refine((v) => Number.isInteger(v) && v >= 1 && v <= 7, "Giorno non valido"),
    startTime: clockTime,
    endTime: clockTime,
    capacityOrders: optionalCount("Capienza non valida", 999),
    cutoffHours: optionalCount("Preavviso non valido", 720),
    active: checkbox,
  })
  .superRefine((d, ctx) => {
    // The DB CHECK says the same thing; saying it here means the operator gets a
    // sentence instead of a constraint name.
    if (d.endTime <= d.startTime) {
      ctx.addIssue({ code: "custom", message: "La fine deve venire dopo l'inizio.", path: ["endTime"] });
    }
  });

/** ISO `yyyy-mm-dd`. The DB CHECK enforces the shape; this gives a sentence. */
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida");

export const shopClosureInput = z
  .object({
    id: optionalText(40),
    /** Blank = every location. */
    shopSlug: optionalText(80),
    fromDate: isoDate,
    /** Blank means a single day, which is the common case — see the action. */
    toDate: z.union([isoDate, z.literal("")]).optional(),
    reason: optionalText(200),
    blocksReservations: checkbox,
    blocksPickup: checkbox,
  })
  .superRefine((d, ctx) => {
    if (d.toDate && d.toDate < d.fromDate) {
      ctx.addIssue({ code: "custom", message: "La fine deve venire dopo l'inizio.", path: ["toDate"] });
    }
    // A closure that stops nothing is a note to self, and would sit in the list
    // looking as though it were doing something.
    if (!d.blocksReservations && !d.blocksPickup) {
      ctx.addIssue({
        code: "custom",
        message: "Scegli almeno una cosa da sospendere.",
        path: ["blocksReservations"],
      });
    }
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

/**
 * A stock correction. In `rettifica` mode `delta` is a signed change ("+10
 * arrivo merce"); in `conteggio` mode it is the absolute counted figure, so an
 * inventory count doesn't require the operator to do the subtraction by hand
 * against a number that may move while they're counting.
 */
export const stockAdjustInput = z
  .object({
    productId: z.string().trim().min(1),
    mode: z.enum(["rettifica", "conteggio"]).default("rettifica"),
    delta: z.coerce.number().int(),
    reason: optionalText(200),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "rettifica" && d.delta === 0) {
      ctx.addIssue({ code: "custom", message: "Inserisci una variazione diversa da zero", path: ["delta"] });
    }
    if (d.mode === "conteggio" && d.delta < 0) {
      ctx.addIssue({ code: "custom", message: "La giacenza contata non può essere negativa", path: ["delta"] });
    }
  });

export const reservationStatusInput = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]),
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
  fulfilment: z.enum(FULFILMENT_MODES),
  shopSlug: optionalText(80),
  pickupSlot: optionalText(20),
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
  /** Which location a staff account is confined to; blank = every location. */
  shopSlug: optionalText(80),
});

export const userPasswordInput = z.object({
  id: z.string().trim().min(1),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(200),
});

/**
 * Enrolling a walk-in customer at the counter.
 *
 * Deliberately looser than the public `registerSchema`: a norcineria genuinely
 * has loyalty customers with no email address, and refusing to enrol them is
 * how the programme ends up with no members. Email OR phone is enough — but at
 * least one, or there is no way to ever reach the person whose points these are.
 *
 * No password field: a counter-created account is a loyalty card, not a login.
 * It becomes a real account when its owner sets a password through the ordinary
 * "password dimenticata" flow, which needs the email — hence the nudge to
 * capture one when the customer has it.
 */
export const staffCustomerInput = z
  .object({
    name: z.string().trim().min(2, "Il nome è obbligatorio").max(200),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(200)
      .email("Email non valida")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    phone: optionalText(40),
    marketingConsent: z.coerce.boolean().optional().default(false),
  })
  .refine((d) => !!d.email || !!d.phone, {
    message: "Serve almeno un'email o un telefono per identificare il cliente.",
    path: ["email"],
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
