/**
 * Drizzle schema — the whole platform data model (SQLite).
 *
 * Conventions:
 *  - Text primary keys (nanoid) so records are portable and non-guessable.
 *  - Timestamps stored as integer unix-ms (`timestamp_ms`). Both an app-layer
 *    `$defaultFn` and a SQL `DEFAULT` are set so raw inserts are never NULL.
 *  - Booleans stored as integer 0/1 (`mode: "boolean"`).
 *  - JSON columns store arrays/objects as text (`mode: "json"`).
 *  - Money stored as integer **cents** to avoid float drift.
 *  - Text enums are additionally guarded by SQL CHECK constraints, since Drizzle
 *    enums are TypeScript-only and SQLite would otherwise accept any string.
 *  - Cross-entity references use real FOREIGN KEYs (foreign_keys pragma is ON).
 */
import { sqliteTable, text, integer, real, index, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => nanoid());

const nowMs = sql`(unixepoch() * 1000)`;

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .default(nowMs);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .default(nowMs);

// ── Content: shops ───────────────────────────────────────────────────────────
export const shops = sqliteTable("shops", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
  tagline: text("tagline").notNull().default(""),
  description: text("description").notNull().default(""),
  address: text("address").notNull().default(""),
  addressConfirmed: integer("address_confirmed", { mode: "boolean" }).notNull().default(true),
  hours: text("hours", { mode: "json" }).$type<{ label: string; value: string }[]>().notNull().default([]),
  hoursConfirmed: integer("hours_confirmed", { mode: "boolean" }).notNull().default(true),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  highlights: text("highlights", { mode: "json" }).$type<string[]>().notNull().default([]),
  imageLabel: text("image_label").notNull().default(""),
  image: text("image").notNull().default(""),
  // Per-location service availability (refines the global master switches).
  porchettaEnabled: integer("porchetta_enabled", { mode: "boolean" }).notNull().default(true),
  storeEnabled: integer("store_enabled", { mode: "boolean" }).notNull().default(true),
  reservationsEnabled: integer("reservations_enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

// ── Content: products ────────────────────────────────────────────────────────
export const products = sqliteTable(
  "products",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shopSlug: text("shop_slug")
      .notNull()
      .references(() => shops.slug, { onDelete: "restrict", onUpdate: "cascade" }),
    category: text("category").notNull().default(""),
    description: text("description").notNull().default(""),
    imageLabel: text("image_label").notNull().default(""),
    image: text("image").notNull().default(""),
    // E-commerce fields (nullable until a product is put on sale)
    priceCents: integer("price_cents"),
    unit: text("unit"), // e.g. "kg", "pezzo", "confezione"
    // VAT rate in basis points (Italian IVA): 400=4%, 500=5%, 1000=10%, 2200=22%.
    // Consumer prices are VAT-inclusive, so `priceCents` is the gross amount.
    vatRateBps: integer("vat_rate_bps").notNull().default(1000),
    // Fresh meat/salumi are sold to order by weight (price expressed per kg/etto).
    soldByWeight: integer("sold_by_weight", { mode: "boolean" }).notNull().default(false),
    // EU Reg. 1169/2011: the 14 mandatory allergens present in the product.
    allergens: text("allergens", { mode: "json" }).$type<string[]>().notNull().default([]),
    // Origin / traceability (e.g. "Suino nazionale — Marche") and ingredient list.
    origin: text("origin"),
    ingredients: text("ingredients"),
    purchasable: integer("purchasable", { mode: "boolean" }).notNull().default(false),
    stock: integer("stock"), // null = unlimited / made-to-order
    // When a low-stock alert was last emailed to the owner; cleared when restocked
    // above the threshold, so a single dip doesn't spam repeat alerts.
    lowStockNotifiedAt: integer("low_stock_notified_at", { mode: "timestamp_ms" }),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("products_shop_idx").on(t.shopSlug),
    check("products_price_ck", sql`${t.priceCents} is null or ${t.priceCents} >= 0`),
    check("products_stock_ck", sql`${t.stock} is null or ${t.stock} >= 0`),
    check("products_vat_ck", sql`${t.vatRateBps} >= 0 and ${t.vatRateBps} <= 10000`),
  ],
);

// ── Inventory movements (stock adjustment ledger) ────────────────────────────
export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(), // + received / correction up, − shrink/waste
    reason: text("reason").notNull().default(""),
    stockAfter: integer("stock_after").notNull(),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("stock_mov_product_idx").on(t.productId)],
);

// ── Back-in-stock notification requests ──────────────────────────────────────
export const stockNotifications = sqliteTable(
  "stock_notifications",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    // Stamped when the "back in stock" email was sent (null = still waiting).
    notifiedAt: integer("notified_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("stock_notif_product_idx").on(t.productId, t.notifiedAt)],
);

// ── Content: blog posts ──────────────────────────────────────────────────────
export const blogPosts = sqliteTable("blog_posts", {
  id: id(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  date: text("date").notNull(), // ISO yyyy-mm-dd
  category: text("category").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  content: text("content", { mode: "json" }).$type<string[]>().notNull().default([]),
  imageLabel: text("image_label").notNull().default(""),
  image: text("image"),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

// ── Users (customers + staff/admin) ──────────────────────────────────────────
export const users = sqliteTable(
  "users",
  {
    id: id(),
    username: text("username").notNull().unique(),
    email: text("email").unique(),
    name: text("name").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    phone: text("phone"),
    role: text("role", { enum: ["customer", "staff", "admin"] }).notNull().default("customer"),
    // Deactivated accounts cannot log in (staff offboarding / suspension).
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    marketingConsent: integer("marketing_consent", { mode: "boolean" }).notNull().default(false),
    emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [check("users_role_ck", sql`${t.role} in ('customer', 'staff', 'admin')`)],
);

// ── Sessions (cookie-based) ──────────────────────────────────────────────────
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // opaque random token stored in the cookie
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    // Sliding idle-timeout marker: refreshed (at most once per slide interval) on
    // each authenticated access so a long-abandoned session expires before its
    // 30-day absolute cap.
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .default(nowMs),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ── Loyalty ──────────────────────────────────────────────────────────────────
export const loyaltyAccounts = sqliteTable(
  "loyalty_accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    points: integer("points").notNull().default(0),
    cardNumber: text("card_number").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [check("loyalty_points_ck", sql`${t.points} >= 0`)],
);

export const loyaltyTransactions = sqliteTable(
  "loyalty_transactions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(), // + earned, − redeemed
    balanceAfter: integer("balance_after").notNull(),
    reason: text("reason").notNull().default(""),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("loyalty_tx_user_idx").on(t.userId),
    check("loyalty_tx_balance_ck", sql`${t.balanceAfter} >= 0`),
  ],
);

export const rewards = sqliteTable(
  "rewards",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    points: integer("points").notNull(),
    image: text("image"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [check("rewards_points_ck", sql`${t.points} >= 0`)],
);

export const redemptions = sqliteTable(
  "redemptions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rewardId: text("reward_id").notNull(),
    rewardName: text("reward_name").notNull(),
    pointsSpent: integer("points_spent").notNull(),
    status: text("status", { enum: ["pending", "fulfilled", "cancelled"] })
      .notNull()
      .default("pending"),
    createdAt: createdAt(),
    fulfilledAt: integer("fulfilled_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("redemptions_user_idx").on(t.userId),
    index("redemptions_status_idx").on(t.status),
    check("redemptions_status_ck", sql`${t.status} in ('pending', 'fulfilled', 'cancelled')`),
    check("redemptions_points_ck", sql`${t.pointsSpent} >= 0`),
  ],
);

// ── Reservations ─────────────────────────────────────────────────────────────
export const reservations = sqliteTable(
  "reservations",
  {
    id: id(),
    reference: text("reference").notNull().unique(), // human-friendly code
    type: text("type", { enum: ["table", "porchetta", "order"] }).notNull().default("table"),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    date: text("date").notNull(), // ISO yyyy-mm-dd
    time: text("time"), // HH:MM (optional for porchetta pickup)
    guests: integer("guests"),
    quantityKg: real("quantity_kg"), // for porchetta pre-orders
    shopSlug: text("shop_slug")
      .notNull()
      .references(() => shops.slug, { onDelete: "restrict", onUpdate: "cascade" }),
    notes: text("notes"),
    status: text("status", { enum: ["pending", "confirmed", "completed", "cancelled"] })
      .notNull()
      .default("pending"),
    adminNotes: text("admin_notes"),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }), // linked customer, if logged in
    // When the porchetta pickup reminder was sent (null = not yet). Makes the
    // reminder cron idempotent so repeat runs don't re-email the same customer.
    remindedAt: integer("reminded_at", { mode: "timestamp_ms" }),
    // Porchetta pre-order that exceeded the Saturday weekly kg capacity — held on
    // a waitlist rather than confirmed (owner can promote it).
    waitlisted: integer("waitlisted", { mode: "boolean" }).notNull().default(false),
    // When the "your porchetta is ready" pickup notice was sent (null = not sent);
    // makes that admin action idempotent.
    readyAt: integer("ready_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("reservations_status_idx").on(t.status),
    index("reservations_date_idx").on(t.date),
    index("reservations_user_idx").on(t.userId),
    index("reservations_shop_idx").on(t.shopSlug),
    index("reservations_cron_idx").on(t.type, t.status, t.date),
    check("reservations_type_ck", sql`${t.type} in ('table', 'porchetta', 'order')`),
    check(
      "reservations_status_ck",
      sql`${t.status} in ('pending', 'confirmed', 'completed', 'cancelled')`,
    ),
  ],
);

// ── Newsletter ───────────────────────────────────────────────────────────────
export const newsletterSubscribers = sqliteTable(
  "newsletter_subscribers",
  {
    id: id(),
    email: text("email").notNull().unique(),
    status: text("status", { enum: ["pending", "confirmed", "unsubscribed"] })
      .notNull()
      .default("pending"),
    token: text("token").notNull(),
    source: text("source").default("footer"),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("newsletter_token_idx").on(t.token),
    index("newsletter_status_idx").on(t.status),
    check(
      "newsletter_status_ck",
      sql`${t.status} in ('pending', 'confirmed', 'unsubscribed')`,
    ),
  ],
);

// ── Orders (e-commerce) ──────────────────────────────────────────────────────
export const orders = sqliteTable(
  "orders",
  {
    id: id(),
    orderNumber: text("order_number").notNull().unique(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    status: text("status", {
      enum: ["pending", "paid", "fulfilled", "cancelled", "refunded"],
    })
      .notNull()
      .default("pending"),
    fulfilment: text("fulfilment", { enum: ["pickup", "shipping"] }).notNull().default("pickup"),
    shopSlug: text("shop_slug").references(() => shops.slug, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    shippingAddress: text("shipping_address", { mode: "json" }).$type<Record<string, string>>(),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    // Applied coupon (if any) and the amount it took off the subtotal.
    discountCode: text("discount_code"),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    currency: text("currency").notNull().default("eur"),
    paymentProvider: text("payment_provider").default("stripe"),
    paymentStatus: text("payment_status", { enum: ["unpaid", "paid", "refunded"] })
      .notNull()
      .default("unpaid"),
    stripeSessionId: text("stripe_session_id"),
    // Shipping fulfilment tracking, set by the owner when an order ships.
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_user_idx").on(t.userId),
    index("orders_shop_idx").on(t.shopSlug),
    check(
      "orders_status_ck",
      sql`${t.status} in ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded')`,
    ),
    check("orders_fulfilment_ck", sql`${t.fulfilment} in ('pickup', 'shipping')`),
    check("orders_payment_status_ck", sql`${t.paymentStatus} in ('unpaid', 'paid', 'refunded')`),
    check(
      "orders_amounts_ck",
      sql`${t.subtotalCents} >= 0 and ${t.shippingCents} >= 0 and ${t.totalCents} >= 0`,
    ),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: id(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id"),
    productSlug: text("product_slug"),
    name: text("name").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    // VAT rate snapshot at order time (basis points) — the product's rate may
    // later change, but a placed order's fiscal breakdown must stay fixed.
    vatRateBps: integer("vat_rate_bps").notNull().default(1000),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    check(
      "order_items_amounts_ck",
      sql`${t.unitPriceCents} >= 0 and ${t.lineTotalCents} >= 0 and ${t.quantity} > 0`,
    ),
  ],
);

// ── Discount codes / coupons ─────────────────────────────────────────────────
export const discountCodes = sqliteTable(
  "discount_codes",
  {
    id: id(),
    code: text("code").notNull().unique(), // stored uppercased
    // percent: `value` is a whole percent (0–100).
    // fixed:   `value` is an amount in cents deducted from the subtotal.
    // free_shipping: `value` is ignored; the order's shipping is waived.
    type: text("type", { enum: ["percent", "fixed", "free_shipping"] }).notNull().default("percent"),
    value: integer("value").notNull().default(0),
    // Minimum order subtotal (cents) required for the code to apply.
    minSubtotalCents: integer("min_subtotal_cents").notNull().default(0),
    // Total redemption cap across all customers (null = unlimited).
    maxRedemptions: integer("max_redemptions"),
    timesUsed: integer("times_used").notNull().default(0),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("discount_active_idx").on(t.active),
    check("discount_type_ck", sql`${t.type} in ('percent', 'fixed', 'free_shipping')`),
    check("discount_value_ck", sql`${t.value} >= 0`),
  ],
);

// ── Email outbox (audit + dev fallback) ──────────────────────────────────────
export const emailOutbox = sqliteTable(
  "email_outbox",
  {
    id: id(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull().default(""),
    text: text("text").notNull().default(""),
    status: text("status", { enum: ["queued", "sent", "failed"] }).notNull().default("queued"),
    error: text("error"),
    // Number of delivery attempts made — lets the outbox drain retry transient
    // failures while capping permanently-failing messages.
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("email_outbox_status_idx").on(t.status),
    check("email_outbox_status_ck", sql`${t.status} in ('queued', 'sent', 'failed')`),
  ],
);

// ── Settings (admin-editable key/value) ──────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: updatedAt(),
});

// ── Analytics (first-party, cookieless page views — no PII) ───────────────────
export const pageViews = sqliteTable(
  "page_views",
  {
    id: id(),
    path: text("path").notNull(),
    referrer: text("referrer"), // referrer host only (or null) — never a full URL with query
    createdAt: createdAt(),
  },
  (t) => [index("page_views_created_idx").on(t.createdAt), index("page_views_path_idx").on(t.path)],
);

// ── Audit log (who did which sensitive back-office action) ────────────────────
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    // Actor snapshot (kept even if the user is later deleted — audit must persist).
    actorId: text("actor_id"),
    actorName: text("actor_name").notNull().default(""),
    action: text("action").notNull(), // machine key, e.g. "order.refund"
    entity: text("entity").notNull().default(""), // e.g. "order", "user", "setting"
    entityId: text("entity_id"),
    summary: text("summary").notNull().default(""), // human-readable Italian line
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_entity_idx").on(t.entity, t.entityId),
  ],
);

// ── Inferred row types (canonical runtime shapes) ────────────────────────────
export type ShopRow = typeof shops.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type BlogPostRow = typeof blogPosts.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type ReservationRow = typeof reservations.$inferSelect;
export type RewardRow = typeof rewards.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type DiscountCodeRow = typeof discountCodes.$inferSelect;
export type StockMovementRow = typeof stockMovements.$inferSelect;
