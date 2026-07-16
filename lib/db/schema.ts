/**
 * Drizzle schema — the whole platform data model (SQLite).
 *
 * Conventions:
 *  - Text primary keys (nanoid) so records are portable and non-guessable.
 *  - Timestamps stored as integer unix-ms (`timestamp_ms`).
 *  - Booleans stored as integer 0/1 (`mode: "boolean"`).
 *  - JSON columns store arrays/objects as text (`mode: "json"`).
 *  - Money stored as integer **cents** to avoid float drift.
 */
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => nanoid());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date());

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
    shopSlug: text("shop_slug").notNull(),
    category: text("category").notNull().default(""),
    description: text("description").notNull().default(""),
    imageLabel: text("image_label").notNull().default(""),
    image: text("image").notNull().default(""),
    // E-commerce fields (nullable until a product is put on sale)
    priceCents: integer("price_cents"),
    unit: text("unit"), // e.g. "kg", "pezzo", "confezione"
    purchasable: integer("purchasable", { mode: "boolean" }).notNull().default(false),
    stock: integer("stock"), // null = unlimited / made-to-order
    featured: integer("featured", { mode: "boolean" }).notNull().default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("products_shop_idx").on(t.shopSlug)],
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
export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  role: text("role", { enum: ["customer", "staff", "admin"] }).notNull().default("customer"),
  marketingConsent: integer("marketing_consent", { mode: "boolean" }).notNull().default(false),
  emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

// ── Sessions (cookie-based) ──────────────────────────────────────────────────
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // opaque random token stored in the cookie
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ── Loyalty ──────────────────────────────────────────────────────────────────
export const loyaltyAccounts = sqliteTable("loyalty_accounts", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  points: integer("points").notNull().default(0),
  cardNumber: text("card_number").notNull().unique(),
  createdAt: createdAt(),
});

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
  (t) => [index("loyalty_tx_user_idx").on(t.userId)],
);

export const rewards = sqliteTable("rewards", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  points: integer("points").notNull(),
  image: text("image"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

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
  (t) => [index("redemptions_user_idx").on(t.userId)],
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
    shopSlug: text("shop_slug").notNull(),
    notes: text("notes"),
    status: text("status", { enum: ["pending", "confirmed", "completed", "cancelled"] })
      .notNull()
      .default("pending"),
    adminNotes: text("admin_notes"),
    userId: text("user_id"), // linked customer, if logged in
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  },
  (t) => [index("reservations_status_idx").on(t.status), index("reservations_date_idx").on(t.date)],
);

// ── Newsletter ───────────────────────────────────────────────────────────────
export const newsletterSubscribers = sqliteTable("newsletter_subscribers", {
  id: id(),
  email: text("email").notNull().unique(),
  status: text("status", { enum: ["pending", "confirmed", "unsubscribed"] })
    .notNull()
    .default("pending"),
  token: text("token").notNull(),
  source: text("source").default("footer"),
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
});

// ── Orders (e-commerce) ──────────────────────────────────────────────────────
export const orders = sqliteTable(
  "orders",
  {
    id: id(),
    orderNumber: text("order_number").notNull().unique(),
    userId: text("user_id"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    status: text("status", {
      enum: ["pending", "paid", "fulfilled", "cancelled", "refunded"],
    })
      .notNull()
      .default("pending"),
    fulfilment: text("fulfilment", { enum: ["pickup", "shipping"] }).notNull().default("pickup"),
    shopSlug: text("shop_slug"),
    shippingAddress: text("shipping_address", { mode: "json" }).$type<Record<string, string>>(),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    currency: text("currency").notNull().default("eur"),
    paymentProvider: text("payment_provider").default("stripe"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    stripeSessionId: text("stripe_session_id"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  },
  (t) => [index("orders_status_idx").on(t.status), index("orders_user_idx").on(t.userId)],
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
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
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
    createdAt: createdAt(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("email_outbox_status_idx").on(t.status)],
);

// ── Settings (admin-editable key/value) ──────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
});

// ── Inferred row types (canonical runtime shapes) ────────────────────────────
export type ShopRow = typeof shops.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type BlogPostRow = typeof blogPosts.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type ReservationRow = typeof reservations.$inferSelect;
export type RewardRow = typeof rewards.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
