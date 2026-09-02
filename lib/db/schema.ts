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
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  check,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
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
  hours: text("hours", { mode: "json" }).$type<{ label: string; value: string }[]>().notNull().default([]),
  hoursConfirmed: integer("hours_confirmed", { mode: "boolean" }).notNull().default(true),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  highlights: text("highlights", { mode: "json" }).$type<string[]>().notNull().default([]),
  imageLabel: text("image_label").notNull().default(""),
  image: text("image").notNull().default(""),
  // Structured opening hours, authoritative when present: one entry per weekday
  // (1 = Monday … 7 = Sunday) with zero or more "HH:MM"–"HH:MM" ranges. An empty
  // `ranges` array means explicitly closed that day. The free-text `hours` above
  // stays as the rendered label (and the fallback for shops not yet migrated),
  // so "aperto adesso" can be decided from data instead of parsed prose.
  hoursStructured: text("hours_structured", { mode: "json" }).$type<
    { day: number; ranges: { open: string; close: string }[] }[]
  >(),
  // Per-location service availability (refines the global master switches).
  porchettaEnabled: integer("porchetta_enabled", { mode: "boolean" }).notNull().default(true),
  // Kg of porchetta this location can prepare for one pickup day. Null falls
  // back to the shop-wide `porchetta.capacityKgPerDay` setting.
  porchettaCapacityKg: integer("porchetta_capacity_kg"),
  // Seats bookable in one time slot; null = unlimited (no double-booking guard).
  seatsCapacity: integer("seats_capacity"),
  storeEnabled: integer("store_enabled", { mode: "boolean" }).notNull().default(true),
  reservationsEnabled: integer("reservations_enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

// ── Content: products ────────────────────────────────────────────────────────
// ── Taxonomy: product & news categories ──────────────────────────────────────
/**
 * Categories, as records rather than as free text typed twice.
 *
 * They used to exist only as a string on `products.category` and
 * `blog_posts.category`, with everything downstream *derived*: the storefront
 * filter rail was `select distinct`, the VAT default was inferred from whatever
 * rate a category's products mostly used, and the accent colour came from
 * keyword matching in `lib/categories.ts`. That meant a typo silently forked the
 * catalogue, a mixed category (Gastronomia held two VAT rates) pre-filled the
 * wrong rate on the next product, editorial order was impossible, and renaming
 * meant an UPDATE by hand.
 *
 * `kind` keeps the two vocabularies in one table without letting them mix — the
 * shop files products under "Formaggi" and posts under "Formaggi" too, and they
 * are not the same list. Slugs are therefore unique *per kind*, not globally.
 *
 * `products.category` / `blog_posts.category` are kept as a denormalised copy of
 * the name, rewritten whenever the category is renamed, so every existing reader
 * (storefront filters, CSV export, the IVA report) keeps working untouched while
 * `category_id` becomes the source of truth.
 */
export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["product", "post"] })
      .notNull()
      .default("product"),
    // Self-reference: "Salumi → Stagionati" without a second table. Deleting a
    // parent promotes its children rather than taking them with it.
    parentId: text("parent_id").references((): AnySQLiteColumn => categories.id, {
      onDelete: "set null",
    }),
    // Declared, not inferred. Null = no opinion, so the product form keeps its
    // own default.
    defaultVatRateBps: integer("default_vat_rate_bps"),
    // Accent key (see `lib/categories.ts`), e.g. "salumi". Null falls back to the
    // keyword match, so an unclassified category still gets a sensible colour.
    accent: text("accent"),
    description: text("description").notNull().default(""),
    image: text("image"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    sortOrder: integer("sort_order").notNull().default(0),
    // Hidden from the storefront without destroying the grouping.
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("categories_kind_slug_idx").on(t.kind, t.slug),
    index("categories_kind_sort_idx").on(t.kind, t.sortOrder),
    check("categories_kind_ck", sql`${t.kind} in ('product', 'post')`),
    check(
      "categories_vat_ck",
      sql`${t.defaultVatRateBps} is null or (${t.defaultVatRateBps} >= 0 and ${t.defaultVatRateBps} <= 10000)`,
    ),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shopSlug: text("shop_slug")
      .notNull()
      .references(() => shops.slug, { onDelete: "restrict", onUpdate: "cascade" }),
    // Denormalised category name — the display/filter/export copy. `categoryId`
    // is the source of truth; this is rewritten when the category is renamed.
    //
    // No `onDelete` action, i.e. RESTRICT: deleting a category that still holds
    // products is refused by the database, not just by the admin action. A
    // `set null` here would leave those products carrying a name that groups
    // nothing, which is the state the taxonomy exists to prevent — so they must
    // be merged into another category first. (SQLite cannot alter a foreign key
    // after the fact, so this is also what migration 0029's ADD COLUMN created.)
    category: text("category").notNull().default(""),
    categoryId: text("category_id").references(() => categories.id),
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
    // Per-product low-stock threshold; null falls back to store.lowStockThreshold.
    // A slow-moving cured product and a daily fresh one need different points.
    reorderPoint: integer("reorder_point"),
    // Purchase cost (integer cents, VAT-excluded) for margin reporting, plus the
    // purchasing metadata that makes a restock actionable. All optional.
    costCents: integer("cost_cents"),
    sku: text("sku"),
    supplier: text("supplier"),
    // Search-snippet overrides, as on the news diary: a shelf description is
    // not always the sentence a result page should show. Blank = derived.
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    // When a low-stock alert was last emailed to the owner; cleared when restocked
    // above the threshold, so a single dip doesn't spam repeat alerts.
    lowStockNotifiedAt: integer("low_stock_notified_at", { mode: "timestamp_ms" }),
    // Archived products leave the catalogue and every picker but keep their id,
    // their movement ledger and their order lines. Deleting a product instead
    // cascades its `stock_movements` away, which loses the quantity history a
    // stock ledger exists to preserve — so archiving is the default.
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("products_shop_idx").on(t.shopSlug),
    index("products_category_idx").on(t.categoryId),
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
  // Denormalised name; `categoryId` is the source of truth (see `categories`).
  // RESTRICT, like `products.categoryId` — merge before deleting.
  category: text("category").notNull().default(""),
  categoryId: text("category_id").references(() => categories.id),
  excerpt: text("excerpt").notNull().default(""),
  // Blocks separated by a blank line in the editor, in the grammar
  // `lib/blog-article.ts` parses: paragraphs plus `## titolo`, `- voce`,
  // `> citazione`, `![didascalia](/images/x.jpg)` and `| etichetta | valore`.
  // Still a plain `string[]` on disk, so every post written before the grammar
  // existed reads back as the paragraphs it always was.
  content: text("content", { mode: "json" }).$type<string[]>().notNull().default([]),
  // Which of the four article templates renders this post — see
  // `BLOG_LAYOUTS` in `lib/blog-article.ts`. Free text rather than a CHECK
  // constraint: SQLite would force a table rebuild for one, and an unknown
  // value already falls back to the default template.
  layout: text("layout").notNull().default("editoriale"),
  imageLabel: text("image_label").notNull().default(""),
  image: text("image"),
  // Search-result title and snippet. Both optional: the post's own title and
  // excerpt are the fallback, but a listing blurb and a search snippet are not
  // always the same sentence.
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
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
    // Which location a staff account works at. Null = every location, which is
    // what an admin always is and what every account was before this column
    // existed — so an install that never sets it behaves exactly as before.
    //
    // This is a real access boundary, not a UI default: `lib/admin/scope.ts`
    // forces it into the list filters and refuses the detail pages and the
    // mutating actions for another location's rows. Two shops shared one
    // undivided view, so a counter person at Carni could edit Centro's
    // products, refund Centro's orders and read Centro's customers.
    //
    // No FK action is declared, unlike the other `shop_slug` columns: those were
    // written by a CREATE TABLE, where drizzle-kit emits the clause, whereas
    // `ALTER TABLE ... ADD COLUMN ... REFERENCES` silently drops it (see the note
    // on `products.category_id`). Declaring `onUpdate: cascade` here would put a
    // cascade in the snapshot that the database does not have, and the next
    // `db:generate` would want to rebuild `users` — a table with its own FTS
    // triggers — to reconcile it. Harmless in practice: `saveShop` never writes
    // `slug` on an existing shop, so a slug never changes under a reference.
    shopSlug: text("shop_slug").references(() => shops.slug),
    // Deactivated accounts cannot log in (staff offboarding / suspension).
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    marketingConsent: integer("marketing_consent", { mode: "boolean" }).notNull().default(false),
    emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
    // Optional TOTP two-factor auth (base32 secret; only enforced once enabled).
    totpSecret: text("totp_secret"),
    totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
    // Single-use 2FA recovery codes, stored as SHA-256 hashes (they are
    // high-entropy random strings, so a fast hash is appropriate — a slow KDF
    // here would mean hashing every code on every login attempt). `usedAt`
    // marks a spent code instead of dropping it, so the UI can say how many
    // remain of how many were issued.
    totpRecoveryCodes: text("totp_recovery_codes", { mode: "json" })
      .$type<{ hash: string; usedAt: number | null }[]>(),
    // ── Login telemetry / throttling ───────────────────────────────────────
    // Stamped on every successful login. Its first job is support ("when did
    // this account last work?"); its second is `runPointsExpiry`-style sweeps
    // that need to tell a dormant account from a new one.
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    // Consecutive failed password/2FA attempts, reset to 0 on success. The
    // per-IP limiter in `lib/rate-limit.ts` cannot see credential stuffing that
    // rotates IPs against one account, which is the attack that actually
    // matters for a shop whose usernames are guessable.
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    // Set when `failedLoginCount` crosses the threshold; login refuses until it
    // passes. Deliberately a timestamp rather than a boolean so the lock
    // expires on its own and never needs an operator to clear it.
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  // NB: no CHECK constraint may be ADDED to this table. SQLite forces a full
  // table rebuild for a new CHECK, and rebuilding `users` silently destroys the
  // `users_fts` index and its three triggers (drizzle/0024) — with tsc, eslint
  // and the build all staying green. The `role` check below predates the FTS
  // index and is fine where it is; new enums here are enforced by Drizzle's
  // types plus zod at the entry points, exactly as `orders.paymentMethod` is.
  (t) => [
    // Dashboard counts customers by role + createdAt; the users list sorts by createdAt.
    index("users_created_idx").on(t.createdAt),
    index("users_role_idx").on(t.role),
    index("users_shop_idx").on(t.shopSlug),
    check("users_role_ck", sql`${t.role} in ('customer', 'staff', 'admin')`),
  ],
);

// ── Auth tokens (password reset + email verification) ────────────────────────
/**
 * One-shot, emailed credentials — the two flows that let an account recover
 * itself without an operator.
 *
 * Password reset and email verification differ only in `purpose`, so they share
 * one table: one expiry sweep, one consume path, one set of tests. Splitting
 * them would duplicate every one of those for no gain.
 *
 * `tokenHash` stores SHA-256 of a 32-byte random token, never the token itself —
 * so a database read (a backup, a stray dump, a read-only SQL injection) cannot
 * mint a session. A fast hash is the right choice here, unlike for passwords:
 * the input is already 256 bits of entropy, so there is nothing to brute-force,
 * and a slow KDF would only tax the server. Same reasoning as the 2FA recovery
 * codes on `users.totpRecoveryCodes`.
 *
 * `email` is a snapshot of the address being proven, NOT a copy of
 * `users.email`. An email *change* has to be verified before it is written to
 * the user row — otherwise a typo (or a hostile change) locks the account to an
 * address nobody controls. For `password_reset` it records where the link was
 * sent, which is what makes the audit trail readable a month later.
 */
export const authTokens = sqliteTable(
  "auth_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["password_reset", "email_verify"] }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    // Marks a spent token instead of deleting it, so a second click on the same
    // link can say "questo link è già stato usato" rather than the indistinct
    // "non valido" — and so the audit trail survives until the GC sweep.
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    // Issuing a token supersedes that user's outstanding ones of the same kind.
    index("auth_tokens_user_idx").on(t.userId, t.purpose),
    // The maintenance cron deletes by expiry.
    index("auth_tokens_expires_idx").on(t.expiresAt),
    check("auth_tokens_purpose_ck", sql`${t.purpose} in ('password_reset', 'email_verify')`),
  ],
);

// ── Saved addresses ──────────────────────────────────────────────────────────
/**
 * A customer's address book.
 *
 * `orders.shippingAddress` is a per-order JSON snapshot and stays that way — an
 * order must record where it actually went, frozen, even if the customer later
 * edits or deletes the address. This table is the *source* those snapshots are
 * copied from, so a repeat customer stops retyping their street on every
 * checkout.
 */
export const addresses = sqliteTable(
  "addresses",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull().default(""), // "Casa", "Ufficio" — free text
    name: text("name").notNull().default(""),
    phone: text("phone"),
    street: text("street").notNull().default(""),
    city: text("city").notNull().default(""),
    postcode: text("postcode").notNull().default(""),
    province: text("province").notNull().default(""),
    country: text("country").notNull().default("IT"),
    notes: text("notes"),
    // Exactly one default per user is enforced in `lib/addresses.ts` (clear the
    // others in the same transaction), not by a constraint: SQLite has no
    // partial-unique-index-with-predicate that survives drizzle's snapshot
    // round-trip cleanly, and the invariant is cheap to hold in one place.
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
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
    // Captured at sign-in so "questo dispositivo" in the session list can be
    // told apart from the other three rows. Without them every entry read
    // "Altro dispositivo, ultimo accesso <date>", which is not enough for the
    // one question the list exists to answer: is one of these not me?
    //
    // Deliberately a raw UA string, parsed for display only. Storing a parsed
    // "Chrome su iPhone" would bake today's parser into the data.
    userAgent: text("user_agent"),
    // Best-effort, and only meaningful behind a trusted proxy (see
    // `clientIp`). Kept because a familiar-looking city is often what makes a
    // stranger's session obvious.
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ── Rate limiting (durable) ──────────────────────────────────────────────────
/**
 * Counters for the sliding-window limiter in `lib/rate-limit.ts`.
 *
 * The in-memory map that module started as is per-process, which is exactly
 * wrong for the endpoints that most need limiting: on a serverless deployment
 * each lambda gets its own empty map, so "10 login attempts per minute" is
 * really "10 per minute per instance" — close to no limit at all under load,
 * and reset by every cold start.
 *
 * Only the auth-sensitive routes pay for this table; everything else keeps
 * using the in-memory path, which is free and adequate for flood control.
 */
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    // The caller's bucket key, e.g. "login:1.2.3.4". Primary key so the upsert
    // is a single statement with no read-modify-write race.
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    resetAt: integer("reset_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("rate_limits_reset_idx").on(t.resetAt)],
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
    // Units physically available to hand over; null = unlimited. Decremented on
    // redemption and restored if a redemption is cancelled.
    stock: integer("stock"),
    // How many times one customer may claim this reward; null = no limit.
    maxPerCustomer: integer("max_per_customer"),
    // Availability window (null = always, within `active`).
    availableFrom: integer("available_from", { mode: "timestamp_ms" }),
    availableUntil: integer("available_until", { mode: "timestamp_ms" }),
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
    index("redemptions_created_idx").on(t.createdAt),
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
    // `no_show` is distinct from `cancelled`: the customer never called to cancel
    // and never turned up. It is the only state in which a deposit is forfeit, and
    // keeping the two apart is what makes no-show rate measurable at all.
    status: text("status", { enum: ["pending", "confirmed", "completed", "cancelled", "no_show"] })
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
    // Optional deposit (caparra) to secure a booking. Amount in cents; paid stamp
    // set when the shop records the deposit as received (cash / transfer / card).
    depositCents: integer("deposit_cents").notNull().default(0),
    depositPaidAt: integer("deposit_paid_at", { mode: "timestamp_ms" }),
    // Set when a paid deposit is kept after a no-show. Separate from
    // `depositPaidAt` so the money is still traceable as received-then-forfeit
    // rather than silently disappearing from the booking.
    depositForfeitedAt: integer("deposit_forfeited_at", { mode: "timestamp_ms" }),
    // Set when a paid deposit was given back after a cancellation. A cancelled
    // booking with a paid deposit is money the shop still holds until one of
    // the two stamps says what became of it; without this the caparra simply
    // fell out of every total the moment the booking was cancelled.
    depositRefundedAt: integer("deposit_refunded_at", { mode: "timestamp_ms" }),
    // Which table the party was seated at. Free text on purpose: the shop calls
    // them "1", "vetrina", "sala grande" — a table registry would be more
    // structure than two rooms need. Capacity is enforced on seats, not tables.
    tableNumber: text("table_number"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("reservations_status_idx").on(t.status),
    index("reservations_date_idx").on(t.date),
    index("reservations_user_idx").on(t.userId),
    index("reservations_shop_idx").on(t.shopSlug),
    index("reservations_cron_idx").on(t.type, t.status, t.date),
    index("reservations_created_idx").on(t.createdAt),
    check("reservations_type_ck", sql`${t.type} in ('table', 'porchetta', 'order')`),
    check(
      "reservations_status_ck",
      sql`${t.status} in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')`,
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
    // When the address left the list — by its own link, from the back office,
    // from the account page or through a GDPR erasure. Null while subscribed.
    unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("newsletter_token_idx").on(t.token),
    index("newsletter_status_idx").on(t.status),
    // The admin list filters by source and enumerates the distinct values.
    index("newsletter_source_idx").on(t.source),
    check(
      "newsletter_status_ck",
      sql`${t.status} in ('pending', 'confirmed', 'unsubscribed')`,
    ),
  ],
);

/**
 * Newsletter campaigns: a broadcast that survives being sent.
 *
 * Before this, `sendBroadcast` was fire-and-forget — the composed message left
 * no record beyond the resulting outbox rows, so it could not be drafted,
 * scheduled, reviewed or resent. A campaign holds the composed text plus its
 * audience and outcome.
 */
export const newsletterCampaigns = sqliteTable(
  "newsletter_campaigns",
  {
    id: id(),
    subject: text("subject").notNull(),
    // Plain text as the operator typed it; the HTML body is rendered at send
    // time, so a template change applies to anything not yet sent.
    body: text("body").notNull(),
    // Subscriber `source` to target, or null for every confirmed subscriber.
    // Superseded by `segmentId` when one is set; kept for campaigns sent before
    // named segments existed (and for the "target one signup origin" shortcut).
    segment: text("segment"),
    // A reusable named segment (`customer_segments`), when the campaign targets
    // one rather than a raw signup source.
    segmentId: text("segment_id"),
    status: text("status", { enum: ["draft", "scheduled", "sent", "failed"] })
      .notNull()
      .default("draft"),
    // When a scheduled campaign is due (null for drafts and immediate sends).
    scheduledFor: integer("scheduled_for", { mode: "timestamp_ms" }),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    // How many subscribers it was queued to, recorded at send time.
    recipientCount: integer("recipient_count").notNull().default(0),
    error: text("error"),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("campaigns_status_idx").on(t.status),
    // The scheduler sweeps for due campaigns by (status, scheduledFor).
    index("campaigns_due_idx").on(t.status, t.scheduledFor),
    index("campaigns_created_idx").on(t.createdAt),
  ],
);

// ── Fulfilment: delivery zones & pickup slots ────────────────────────────────
/**
 * Where an order can go, and what that costs.
 *
 * Before this the whole model was one flat `store.shippingCents` applied to
 * anywhere in Italy, with no notion of a local delivery round at all — the enum
 * only knew `pickup` and `shipping`, so "consegna a domicilio in Ancona" had to
 * be sold as a courier shipment or not sold at all.
 *
 * A zone matches an order by its CAP. `postcodes` holds exact codes ("60121")
 * and prefixes ("601"), and the *longest* match wins, so a specific city zone
 * beats the province zone beats the catch-all — an empty list is the catch-all,
 * which is what the seeded "Resto d'Italia" row is.
 *
 * `mode` splits the two things that were one: `delivery` is the shop's own van
 * (its own lead time, its own minimum, usually one location's job) and
 * `shipping` is a courier. They price differently and they appear on different
 * halves of the daily fulfilment screen.
 */
export const deliveryZones = sqliteTable(
  "delivery_zones",
  {
    id: id(),
    name: text("name").notNull(),
    mode: text("mode", { enum: ["delivery", "shipping"] }).notNull().default("delivery"),
    // CAP allow-list: exact codes and/or prefixes. Empty = matches every CAP.
    postcodes: text("postcodes", { mode: "json" }).$type<string[]>().notNull().default([]),
    // Which location runs this round; null = no location in particular (a
    // courier zone, or a single-shop business).
    shopSlug: text("shop_slug").references(() => shops.slug, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    feeCents: integer("fee_cents").notNull().default(0),
    // Subtotal at or above which the fee is waived; null = never free. Null
    // rather than 0 because 0 would otherwise mean "always free", and that is
    // the value an empty number input posts.
    freeOverCents: integer("free_over_cents"),
    // "Consegniamo da 25 euro in su." Refused at checkout, not silently priced.
    minOrderCents: integer("min_order_cents").notNull().default(0),
    // Surcharge per kg of goods sold by weight; null = flat fee only. This is
    // the first thing that ever reads `products.soldByWeight` for pricing.
    perKgCents: integer("per_kg_cents"),
    // How far ahead an order must be placed for this zone.
    leadTimeHours: integer("lead_time_hours").notNull().default(0),
    // Shown to the customer at checkout, e.g. "consegne il martedi e il venerdi".
    note: text("note").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("delivery_zones_mode_idx").on(t.mode, t.active, t.sortOrder),
    check("delivery_zones_mode_ck", sql`${t.mode} in ('delivery', 'shipping')`),
    check(
      "delivery_zones_amounts_ck",
      sql`${t.feeCents} >= 0 and ${t.minOrderCents} >= 0 and ${t.leadTimeHours} >= 0
        and (${t.freeOverCents} is null or ${t.freeOverCents} >= 0)
        and (${t.perKgCents} is null or ${t.perKgCents} >= 0)`,
    ),
  ],
);

/**
 * Bookable pickup windows, one row per weekly recurrence.
 *
 * Table bookings have had an agenda since day one; pickups had nothing — the
 * customer chose "ritiro" and no time, so the counter could not know that forty
 * people were coming at noon, and an order placed at 19:58 for a shop closing at
 * 20:00 was accepted without comment.
 *
 * A shop with **no rows here keeps exactly the old behaviour**: no window is
 * offered and none is required. Slots are opt-in per location, generated from
 * `shops.hoursStructured` in one click or written by hand.
 */
export const pickupSlots = sqliteTable(
  "pickup_slots",
  {
    id: id(),
    shopSlug: text("shop_slug")
      .notNull()
      .references(() => shops.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    // 1 = Monday … 7 = Sunday, matching `shops.hoursStructured`.
    weekday: integer("weekday").notNull(),
    startTime: text("start_time").notNull(), // "HH:MM", business local time
    endTime: text("end_time").notNull(),
    // Orders this window can absorb; null = unlimited.
    capacityOrders: integer("capacity_orders"),
    // How long before the window opens it stops being offered.
    cutoffHours: integer("cutoff_hours").notNull().default(2),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    // One window per shop/day/start: re-running the generator is then an upsert
    // rather than a way to end up with the same slot three times.
    uniqueIndex("pickup_slots_unique_idx").on(t.shopSlug, t.weekday, t.startTime),
    index("pickup_slots_shop_idx").on(t.shopSlug, t.weekday),
    check("pickup_slots_weekday_ck", sql`${t.weekday} between 1 and 7`),
    // Zero-length and inverted windows are the two ways a generated slot can be
    // nonsense; "HH:MM" compares correctly as text.
    check("pickup_slots_time_ck", sql`${t.endTime} > ${t.startTime}`),
    check("pickup_slots_capacity_ck", sql`${t.capacityOrders} is null or ${t.capacityOrders} > 0`),
    check("pickup_slots_cutoff_ck", sql`${t.cutoffHours} >= 0`),
  ],
);

/**
 * Days the shop is shut — Ferragosto, Christmas, a funeral, a refit.
 *
 * Everything else that decides "can this day be booked" was weekly and
 * therefore blind to the calendar: `shops.hoursStructured` says which weekdays
 * are open, `pickup_slots` recurs by weekday, and the reservation form accepted
 * any date at all. The only lever for a closure was the global on/off switch,
 * which also stops the days either side of it.
 *
 * One row covers a range (`fromDate`..`toDate` inclusive, equal for a single
 * day). `shopSlug` null means every location — an August shutdown is one row,
 * not one per shop. The two flags exist because the cases genuinely differ: a
 * kitchen refit stops table bookings while the counter still hands over
 * pre-paid orders, and a delivery-van breakdown is the reverse.
 */
export const shopClosures = sqliteTable(
  "shop_closures",
  {
    id: id(),
    // Null = every location.
    shopSlug: text("shop_slug").references(() => shops.slug, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    fromDate: text("from_date").notNull(), // ISO yyyy-mm-dd, inclusive
    toDate: text("to_date").notNull(), // ISO yyyy-mm-dd, inclusive
    /** Shown to the customer when a date is refused, so "chiuso" has a reason. */
    reason: text("reason").notNull().default(""),
    /** Refuse table/porchetta/order bookings on these days. */
    blocksReservations: integer("blocks_reservations", { mode: "boolean" }).notNull().default(true),
    /** Offer no pickup or delivery window on these days. */
    blocksPickup: integer("blocks_pickup", { mode: "boolean" }).notNull().default(true),
    /**
     * Part of the day only — "chiusi il pomeriggio per inventario". Both set
     * (HH:MM, `startTime` < `endTime`, applied to every day of the range) or
     * both null for the whole day. A partial closure only refuses a booking
     * that has a time inside the window; it never greys the day out.
     */
    startTime: text("start_time"),
    endTime: text("end_time"),
    /**
     * When "avvisa i clienti" last ran and how many it reached. A second run
     * only writes to bookings taken since, so the button can never send the
     * same customer the same notice twice.
     */
    notifiedAt: integer("notified_at", { mode: "timestamp_ms" }),
    notifiedCount: integer("notified_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    // Every read is "does any closure cover this date", so the range bounds lead.
    index("shop_closures_range_idx").on(t.fromDate, t.toDate),
    index("shop_closures_shop_idx").on(t.shopSlug, t.fromDate),
    check("shop_closures_range_ck", sql`${t.toDate} >= ${t.fromDate}`),
    check(
      "shop_closures_date_ck",
      sql`${t.fromDate} like '____-__-__' and ${t.toDate} like '____-__-__'`,
    ),
    check(
      "shop_closures_time_ck",
      sql`(${t.startTime} is null and ${t.endTime} is null) or (${t.startTime} like '__:__' and ${t.endTime} like '__:__' and ${t.endTime} > ${t.startTime})`,
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
    // `delivery` (the shop's own van) is genuinely not `shipping` (a courier):
    // different pricing, different lead time, different half of the daily
    // fulfilment screen. It used to have to masquerade as one or the other.
    fulfilment: text("fulfilment", { enum: ["pickup", "delivery", "shipping"] })
      .notNull()
      .default("pickup"),
    shopSlug: text("shop_slug").references(() => shops.slug, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    shippingAddress: text("shipping_address", { mode: "json" }).$type<Record<string, string>>(),
    // The pickup window the customer chose, as the instant it opens. Null when
    // the shop configures no slots (the pre-slot behaviour) or the order is not
    // a pickup. Stored resolved rather than as a slot id + date so a later edit
    // to the weekly schedule cannot silently move an order already booked.
    pickupSlotAt: integer("pickup_slot_at", { mode: "timestamp_ms" }),
    // Which zone priced this order. No `onDelete` action, i.e. RESTRICT: a zone
    // that has ever served an order cannot be deleted, only deactivated —
    // `shippingCents` records what was charged, but the round it belonged to is
    // what the daily screen groups by.
    deliveryZoneId: text("delivery_zone_id").references(() => deliveryZones.id),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    // Applied coupon (if any) and the amount it took off the subtotal.
    discountCode: text("discount_code"),
    discountCents: integer("discount_cents").notNull().default(0),
    // A reduction the operator agreed at the counter, kept apart from the
    // coupon so an edit can re-derive `discountCents` (coupon + this) instead of
    // wiping it — which is what re-pricing from the coupon alone used to do.
    manualDiscountCents: integer("manual_discount_cents").notNull().default(0),
    // An explicit carriage fee typed by the operator. Null = priced by the zone
    // rules; set, it survives every re-price for the same reason as above.
    shippingOverrideCents: integer("shipping_override_cents"),
    totalCents: integer("total_cents").notNull().default(0),
    currency: text("currency").notNull().default("eur"),
    paymentProvider: text("payment_provider").default("stripe"),
    // How the order is *meant* to be paid, fixed at creation. `card` is prepaid
    // through Stripe; `in_store` and `on_delivery` legitimately sit unpaid until
    // the goods are handed over, which is why the abandoned-checkout sweep has
    // to be able to tell them apart from a card checkout nobody completed.
    // See `lib/payments/methods.ts` for the rules.
    //
    // NB: no CHECK constraint, deliberately. SQLite forces a full table rebuild
    // for a new CHECK, and a rebuild of `orders` silently destroys its FTS5
    // index (drizzle/0024) — see the note on the fiscal date indexes above. The
    // enum is enforced by Drizzle's types and by zod at every entry point.
    paymentMethod: text("payment_method", {
      enum: ["card", "in_store", "on_delivery", "counter"],
    })
      .notNull()
      .default("card"),
    // The instrument the money actually arrived on — null until it does. The
    // invoice's ModalitaPagamento is derived from this, so it is not a duplicate
    // of `paymentMethod`: "pago al ritiro" settled in contanti is MP01, the same
    // order settled on the POS is MP08.
    paidWith: text("paid_with", { enum: ["card", "cash", "pos", "transfer", "other"] }),
    paymentStatus: text("payment_status", { enum: ["unpaid", "paid", "refunded"] })
      .notNull()
      .default("unpaid"),
    // Cumulative amount given back, so a partial refund is representable. Stripe
    // reports `amount_refunded` cumulatively too, which makes syncing a refund
    // issued from the Stripe dashboard idempotent. `paymentStatus` only flips to
    // 'refunded' once this reaches the order total.
    refundedCents: integer("refunded_cents").notNull().default(0),
    // When the money actually settled. Fiscal periods are defined by the payment
    // date, not the date the order was placed — an order taken on the 31st and
    // paid on the 1st belongs to the following month's VAT return.
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    // When this order's goods were taken out of stock. Its only job is to make
    // the decrement happen exactly once: a card order applies it at payment, an
    // order to be paid on collection applies it the moment it is placed (the
    // meat has to be set aside, or the shop oversells what it has promised), and
    // both paths then converge on `finalizeOrder`. Claiming the transition on
    // this column is what stops the second path from decrementing twice — and
    // what tells a cancellation whether there is anything to give back.
    stockAppliedAt: integer("stock_applied_at", { mode: "timestamp_ms" }),
    // When money was last given back. A refund is booked as a credit note in the
    // period it happened, NOT by removing the sale from the (possibly already
    // filed) period it was paid in — so the reversal needs its own date.
    refundedAt: integer("refunded_at", { mode: "timestamp_ms" }),
    // Buyer's fiscal identity, needed for a valid electronic invoice. All
    // optional: a private customer supplies only a codice fiscale (often not even
    // that), a business supplies P.IVA plus an SDI destination code or PEC.
    customerTaxCode: text("customer_tax_code"),
    customerVatNumber: text("customer_vat_number"),
    // 7-char SdI recipient code; "0000000" means "delivered via PEC or the
    // recipient's own portal".
    customerSdiCode: text("customer_sdi_code"),
    customerPec: text("customer_pec"),
    stripeSessionId: text("stripe_session_id"),
    // Captured at finalize. Refund events name the PaymentIntent, not the
    // Checkout Session, so without this every refund lookup had to round-trip
    // to Stripe to translate one into the other.
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    // Shipping fulfilment tracking, set by the owner when an order ships.
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    // When the customer was told the order is ready: "pronto per il ritiro" for
    // a pickup, "in consegna" for a van delivery. Null until then, and never
    // set for a courier shipment, whose equivalent moment is the tracking email.
    //
    // `fulfilled` means handed over, and it used to double as this: the only
    // button that could say "come and collect" was the one that closed the
    // order, so the notice went out as the customer walked away with the bag,
    // and an order ready on the shelf looked exactly like one nobody had
    // started.
    readyAt: integer("ready_at", { mode: "timestamp_ms" }),
    // The booking this order was rung up from, when it started life as an
    // "ordine speciale" reservation ("mi tenga 2 kg di ciauscolo per giovedì").
    //
    // That kind of booking has a name, a phone, a date and notes — and no line
    // items, no price, no VAT, no stock movement and no loyalty accrual. When the
    // customer collected it, someone re-typed the whole thing into a new order or,
    // more often, rang it into the till and the platform never learned it had
    // happened. This column is what closes that loop, and what stops the same
    // booking being converted twice.
    //
    // No `onDelete` action, i.e. RESTRICT — nothing deletes reservations today,
    // and a converted booking is the audit trail behind a real sale.
    reservationId: text("reservation_id").references(() => reservations.id),
    // Notes the customer left at checkout.
    notes: text("notes"),
    // Staff-only annotations (never shown to the customer, never emailed).
    internalNotes: text("internal_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_user_idx").on(t.userId),
    index("orders_shop_idx").on(t.shopSlug),
    // Hot paths: dashboard revenue windows, KPI insights, the IVA report, recent
    // orders and the paginated list all filter/sort by createdAt (+ paymentStatus).
    index("orders_created_idx").on(t.createdAt),
    index("orders_paid_created_idx").on(t.paymentStatus, t.createdAt),
    // NOTE: the IVA report's two date indexes are NOT declared here.
    // It selects by *fiscal* date, which is an expression —
    // `coalesce(paid_at, created_at)` for sales and
    // `coalesce(refunded_at, updated_at)` for reversals, so history from before
    // those columns existed still lands in a period. SQLite will not use an
    // index for a column wrapped in a function, so plain indexes on `paid_at` /
    // `refunded_at` (which is what used to be here) could never serve those
    // predicates and both passes scanned the whole table.
    // The matching expression indexes live in `drizzle/0033_fiscal_date_idx.sql`
    // because drizzle-kit cannot serialize an expression index — it splits the
    // expression on its comma and emits invalid SQL. Being hand-written they are
    // invisible to the schema snapshot, exactly like the FTS tables in 0024: a
    // future migration that REBUILDS the orders table will silently drop them,
    // so re-create them there if that ever happens.
    // Webhook + refund resolve the order by its Stripe session id.
    index("orders_stripe_session_idx").on(t.stripeSessionId),
    // Refund/dispute webhooks arrive keyed on the PaymentIntent.
    index("orders_stripe_pi_idx").on(t.stripePaymentIntentId),
    // The daily fulfilment screen scans one day of pickup windows, and groups
    // the delivery round by zone.
    index("orders_pickup_slot_idx").on(t.pickupSlotAt),
    index("orders_zone_idx").on(t.deliveryZoneId),
    // One order per booking: the guard against converting the same reservation
    // twice lives in the database, not only in the button that hides itself.
    uniqueIndex("orders_reservation_idx").on(t.reservationId),
    check(
      "orders_status_ck",
      sql`${t.status} in ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded')`,
    ),
    check("orders_fulfilment_ck", sql`${t.fulfilment} in ('pickup', 'delivery', 'shipping')`),
    check("orders_payment_status_ck", sql`${t.paymentStatus} in ('unpaid', 'paid', 'refunded')`),
    check(
      "orders_amounts_ck",
      sql`${t.subtotalCents} >= 0 and ${t.shippingCents} >= 0 and ${t.totalCents} >= 0`,
    ),
    check("orders_refunded_ck", sql`${t.refundedCents} >= 0`),
    // NB: no CHECK on the two columns above — see the note on `paymentMethod`.
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
    // Set for a line sold by weight: `unitPriceCents` is then the price per kg
    // and `lineTotalCents = round(unitPriceCents * weightKg)`, with `quantity`
    // staying 1 so every existing sum over quantity keeps working.
    weightKg: real("weight_kg"),
    // True when the counter operator overrode the catalogue price for this line
    // (a negotiated price), so the deviation is visible rather than looking like
    // a stale snapshot of a since-changed product price.
    priceOverridden: integer("price_overridden", { mode: "boolean" }).notNull().default(false),
    lineTotalCents: integer("line_total_cents").notNull(),
    // VAT rate snapshot at order time (basis points) — the product's rate may
    // later change, but a placed order's fiscal breakdown must stay fixed.
    vatRateBps: integer("vat_rate_bps").notNull().default(1000),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    // Sales-by-product reporting keys off the stable product id, not the name.
    index("order_items_product_idx").on(t.productId),
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
    // How many times one customer may use this code (null = unlimited). Counted
    // from `discount_redemptions`, keyed on the account when known and the email
    // otherwise, so a guest can't recycle a one-per-customer code trivially.
    maxPerCustomer: integer("max_per_customer"),
    // Restrict to a customer's very first paid order.
    firstOrderOnly: integer("first_order_only", { mode: "boolean" }).notNull().default(false),
    // Restrict to orders for one location (null = any).
    shopSlug: text("shop_slug"),
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
    // Set for a newsletter send, so delivery outcomes roll back up to the
    // campaign instead of a "sent to 412" figure that hides 80 bounces.
    campaignId: text("campaign_id"),
    // The recipient's own unsubscribe URL, for the `List-Unsubscribe` headers.
    //
    // Stored rather than derived because the drain re-sends from this row long
    // after the broadcast that made it, and the URL carries a per-subscriber
    // token. Null for transactional mail, which must not advertise an
    // unsubscribe at all — nobody opts out of their own order confirmation.
    listUnsubscribeUrl: text("list_unsubscribe_url"),
    // Claimed by a drain pass before delivery is attempted, so a cron sweep and
    // a manual retry can't both send the same message. Cleared on completion.
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("email_outbox_status_idx").on(t.status),
    index("email_outbox_created_idx").on(t.createdAt),
    index("email_outbox_campaign_idx").on(t.campaignId),
    check("email_outbox_status_ck", sql`${t.status} in ('queued', 'sent', 'failed')`),
  ],
);

// ── Settings (admin-editable key/value) ──────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: updatedAt(),
});

// ── Editable storefront copy ─────────────────────────────────────────────────
/**
 * The words on the public pages, as data.
 *
 * The history page's chapters, the home page's services, the porchetta recipe
 * and the legal texts were all hardcoded arrays in TSX, so fixing a typo needed
 * a deploy — while two settings (`home.today`, `home.brands`) were already
 * editable, which shows the pattern was intended and then stopped.
 *
 * Only the **value** lives here. The label, the group, the type and the default
 * stay in `lib/site-content.ts`, because they are developer metadata: a row for
 * a key nothing renders is dead weight, and a key with no row must still render
 * its default. That also makes the seed unnecessary — an empty table renders the
 * site exactly as it reads today, and a row appears the first time someone edits
 * something.
 */
export const siteContent = sqliteTable("site_content", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedByUserId: text("updated_by_user_id"),
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

// ── Product batches (lot + expiry, FEFO) ─────────────────────────────────────
/**
 * A received lot of a stock-tracked product, with its expiry date.
 *
 * Fresh salumi and formaggi carry a lotto and a scadenza that have to be
 * traceable (EU 1169/2011 + HACCP): which batch went out, and what is about to
 * expire. Quantities live here *alongside* `products.stock` rather than
 * replacing it — the flat on-hand figure stays the single number the shop and
 * the storefront read, and batches account for how it is made up.
 */
export const productBatches = sqliteTable(
  "product_batches",
  {
    id: id(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Supplier lot code as printed on the packaging. */
    lotCode: text("lot_code").notNull().default(""),
    /** Expiry / "da consumarsi entro", ISO yyyy-mm-dd. Null = not perishable. */
    expiryDate: text("expiry_date"),
    /** Units received in this lot. */
    quantity: integer("quantity").notNull().default(0),
    /** Units still on hand from this lot (FEFO consumes the earliest expiry). */
    remaining: integer("remaining").notNull().default(0),
    supplier: text("supplier"),
    /** Purchase cost per unit for this lot (cents), for landed-cost accuracy. */
    unitCostCents: integer("unit_cost_cents"),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }),
    note: text("note"),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("batches_product_idx").on(t.productId),
    // FEFO picking and the "in scadenza" report both scan by expiry.
    index("batches_expiry_idx").on(t.expiryDate),
    index("batches_product_expiry_idx").on(t.productId, t.expiryDate),
  ],
);

// ── Discount redemptions (who used which code, and on what) ──────────────────
/**
 * One row per counted coupon use. `discount_codes.times_used` remains the fast
 * counter; this is the ledger behind it — it makes a per-customer cap
 * enforceable and answers "which orders used this code", which a bare counter
 * never could.
 */
export const discountRedemptions = sqliteTable(
  "discount_redemptions",
  {
    id: id(),
    discountCode: text("discount_code").notNull(), // uppercased, snapshot
    orderId: text("order_id"),
    /** Account when known; guests are identified by the order email instead. */
    userId: text("user_id"),
    email: text("email"),
    amountCents: integer("amount_cents").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("discount_redemptions_code_idx").on(t.discountCode),
    index("discount_redemptions_user_idx").on(t.discountCode, t.userId),
    index("discount_redemptions_email_idx").on(t.discountCode, t.email),
    index("discount_redemptions_order_idx").on(t.orderId),
  ],
);

// ── Customer segments (reusable marketing audiences) ─────────────────────────
/**
 * A named, re-evaluated audience. The rule is stored as data rather than a
 * frozen list of addresses, so "clienti fedeli" means the same thing in March as
 * it did in January. Evaluated in `lib/segments.ts`.
 */
export const customerSegments = sqliteTable(
  "customer_segments",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    rule: text("rule", { mode: "json" })
      .$type<{
        /** Newsletter signup origin. */
        source?: string | null;
        /** Loyalty points at or above this. */
        minPoints?: number | null;
        /** Paid orders at or above this count. */
        minOrders?: number | null;
        /** Lifetime paid spend at or above this, in cents. */
        minSpendCents?: number | null;
        /** Has ordered from this shop. */
        shopSlug?: string | null;
        /** No paid order in this many days (win-back). */
        inactiveDays?: number | null;
        /** Only subscribers linked to an account that consented to marketing. */
        requireMarketingConsent?: boolean | null;
      }>()
      .notNull()
      .default({}),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("segments_name_idx").on(t.name)],
);

// ── Saved list views (per-user filter presets) ───────────────────────────────
export const savedViews = sqliteTable(
  "saved_views",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Admin path the view belongs to, e.g. "/admin/orders". */
    path: text("path").notNull(),
    name: text("name").notNull(),
    /** The query string to restore, without a leading "?". */
    query: text("query").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("saved_views_user_path_idx").on(t.userId, t.path)],
);

// ── Inferred row types (canonical runtime shapes) ────────────────────────────
export type ShopRow = typeof shops.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type CategoryKind = CategoryRow["kind"];
export type ProductRow = typeof products.$inferSelect;
export type BlogPostRow = typeof blogPosts.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type ReservationRow = typeof reservations.$inferSelect;
export type RewardRow = typeof rewards.$inferSelect;
export type DeliveryZoneRow = typeof deliveryZones.$inferSelect;
export type PickupSlotRow = typeof pickupSlots.$inferSelect;
export type ShopClosureRow = typeof shopClosures.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type FulfilmentMode = OrderRow["fulfilment"];
export type OrderItemRow = typeof orderItems.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type DiscountCodeRow = typeof discountCodes.$inferSelect;
export type StockMovementRow = typeof stockMovements.$inferSelect;
export type NewsletterCampaignRow = typeof newsletterCampaigns.$inferSelect;
export type EmailOutboxRow = typeof emailOutbox.$inferSelect;
export type ProductBatchRow = typeof productBatches.$inferSelect;
export type CustomerSegmentRow = typeof customerSegments.$inferSelect;
export type SegmentRule = CustomerSegmentRow["rule"];
export type SavedViewRow = typeof savedViews.$inferSelect;
export type AuthTokenRow = typeof authTokens.$inferSelect;
export type AuthTokenPurpose = AuthTokenRow["purpose"];
export type AddressRow = typeof addresses.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type ShopHours = NonNullable<ShopRow["hoursStructured"]>;
