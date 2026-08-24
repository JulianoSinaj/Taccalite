import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  like,
  lt,
  lte,
  ne,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { ftsMatch, type FtsTable } from "@/lib/admin/search";
import { instantInRome } from "@/lib/time";
import {
  orders,
  reservations,
  users,
  loyaltyAccounts,
  newsletterSubscribers,
  emailOutbox,
  products,
  blogPosts,
  rewards,
  discountCodes,
  auditLog,
} from "@/lib/db/schema";

/** The fiscal date an order settled on — identical to `queries.ts`'s `settledAt`
 *  and to the expression `drizzle/0033` indexes. Keep the three in step. */
const ORDER_SETTLED_AT = sql`coalesce(${orders.paidAt}, ${orders.createdAt})`;

/**
 * Shared list filters for the admin.
 *
 * Each entity gets a pair:
 *  - `xFilters(params)` — read the (Italian) query-string names into a typed bag,
 *    defaulting every facet to "all";
 *  - `xWhere(filters)` — turn that bag into a Drizzle predicate.
 *
 * Both the paginated page queries (`lib/admin/queries.ts`) and the CSV export
 * route (`app/api/admin/export/[entity]`) go through these, so an export always
 * reflects exactly the rows the operator is looking at. Add a facet once, here,
 * and both surfaces pick it up.
 */

/** Either Next's resolved `searchParams` object or a real `URLSearchParams`. */
export type ParamBag = Record<string, string | undefined> | URLSearchParams;

function read(p: ParamBag, key: string): string | undefined {
  const raw = p instanceof URLSearchParams ? p.get(key) ?? undefined : p[key];
  const v = raw?.trim();
  return v ? v : undefined;
}

/** A facet value, defaulting to "all" when absent. */
const facet = (p: ParamBag, key: string) => read(p, key) ?? "all";

/** True when a facet is set to something other than the catch-all. */
const isSet = (v: string | undefined): v is string => !!v && v !== "all";

/**
 * `%term%` for a case-insensitive substring match.
 *
 * No `lower()` around the column: SQLite's LIKE already folds ASCII case, so
 * wrapping every row in `lower()` only added a function call per row without
 * changing a single result (verified — and neither form folds non-ASCII case,
 * so nothing is lost).
 *
 * A leading wildcard can't use an index, so this is a table scan. It remains the
 * path for the bounded catalogue tables, and the short-term fallback for the
 * indexed ones — see `searchWhere` below and `lib/admin/search.ts`.
 */
const term = (q: string) => `%${q.toLowerCase()}%`;

/**
 * Search predicate for a table that has a trigram FTS index.
 *
 * Prefers the index; falls back to the supplied LIKE branches for terms too
 * short for trigram (< 3 chars). `extra` is OR-ed in either way — it carries
 * matches the index can't cover because they live on a joined table.
 *
 * The unbounded tables (orders, reservations, users, subscribers, audit) are
 * indexed. The bounded catalogue tables (products, news, rewards, discounts) are
 * a few hundred rows and stay on plain LIKE — indexing them would be upkeep
 * without a payoff.
 */
function searchWhere(
  table: FtsTable,
  q: string,
  likeBranches: () => SQL[],
  extra: SQL[] = [],
): SQL {
  const indexed = ftsMatch(table, q);
  const branches = indexed ? [indexed, ...extra] : [...likeBranches(), ...extra];
  return branches.length === 1 ? branches[0] : or(...branches)!;
}

// ── Sorting ──────────────────────────────────────────────────────────────────
export type SortSpec = { colonna: string; verso: "asc" | "desc" };

/**
 * Read the sort facet, validated against the columns a page actually allows.
 *
 * Sort keys reach SQL as column references, so an unknown key must never be
 * forwarded — anything not in `allowed` falls back to the page's default.
 */
export function sortFilters(
  p: ParamBag,
  allowed: readonly string[],
  fallback: SortSpec,
): SortSpec {
  const colonna = read(p, "colonna");
  const verso = read(p, "verso");
  return {
    colonna: colonna && allowed.includes(colonna) ? colonna : fallback.colonna,
    verso: verso === "asc" || verso === "desc" ? verso : fallback.verso,
  };
}

/** Resolve a validated sort into an ORDER BY clause. */
export function orderByFor(
  sort: SortSpec,
  columns: Record<string, AnyColumn | SQL>,
  fallback: AnyColumn | SQL,
): SQL {
  const col = columns[sort.colonna] ?? fallback;
  return sort.verso === "asc" ? asc(col) : desc(col);
}

/**
 * Drop "all"/empty facets and render the rest as a query string, so a page can
 * hand its active filters to an export link without restating the param names.
 * Returns "" when nothing is filtered.
 */
export function filterQuery(f: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (isSet(v)) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

// ── Date bounds ──────────────────────────────────────────────────────────────
/**
 * A `da`/`a` range is a range of **Rome** days.
 *
 * These used to be `new Date("2026-08-01T00:00:00")`, which is midnight wherever
 * the server happens to live — 02:00 Rome on a UTC host in summer. So a filtered
 * month quietly contained two hours of the previous one and was missing two
 * hours of its own first day, and could never be reconciled against the IVA
 * report, which resolves its period through `lib/time` and is correct.
 *
 * The upper bound is **exclusive** (the start of the day after), for the same
 * reason `vatPeriod` returns one: an order settled at 23:59:59.4 on the last day
 * belongs to the period.
 */
const romeDayStart = (iso: string): Date => instantInRome(iso, "00:00");

const romeDayAfter = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  // UTC arithmetic to roll the calendar date, so a DST boundary can't drop or
  // duplicate a day before `instantInRome` resolves it in the business zone.
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return instantInRome(next, "00:00");
};

// ── Orders ───────────────────────────────────────────────────────────────────
/** Facets are optional so an internal caller can build a partial filter (an
 *  absent facet means "all", exactly like the query-string default). */
export type OrderFilters = {
  negozio?: string;
  stato?: string;
  tipo?: string;
  q?: string;
  /** Inclusive date bounds (yyyy-mm-dd), on the column `data` selects. */
  da?: string;
  a?: string;
  /**
   * Which date the range applies to: when the order was **placed** (default) or
   * when it was **settled**.
   *
   * The IVA report is defined on the settlement date — `coalesce(paid_at,
   * created_at)`, the same expression `queries.ts` calls `settledAt` — and its
   * "Vedi gli ordini →" link used to land on a list filtered by `created_at`.
   * An order taken on the 31st and paid on the 1st therefore appeared in one and
   * not the other, which is the precise disagreement the fiscal-date work exists
   * to prevent.
   */
  data?: string;
};

export function orderFilters(p: ParamBag): OrderFilters {
  return {
    negozio: facet(p, "negozio"),
    stato: facet(p, "stato"),
    tipo: facet(p, "tipo"),
    q: read(p, "q"),
    da: read(p, "da"),
    a: read(p, "a"),
    data: facet(p, "data"),
  };
}

export function ordersWhere(f: OrderFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (isSet(f.negozio)) conds.push(eq(orders.shopSlug, f.negozio));
  if (isSet(f.stato)) {
    if (f.stato === "to-fulfil") {
      // A work-queue view, not a stored status: settled but not handed over.
      // It used to resolve to the same predicate as the "Pagati" chip, so two
      // chips gave one view.
      conds.push(and(eq(orders.paymentStatus, "paid"), eq(orders.status, "paid"))!);
    } else if (f.stato === "unpaid") {
      // Manual drafts and abandoned checkouts. There was no chip for these at
      // all, on the very page that creates them.
      conds.push(eq(orders.paymentStatus, "unpaid"));
    } else if (f.stato === "incassati") {
      // "Money actually taken", which is what the IVA report counts — and which
      // no chip could express. `stato=paid` means `status = 'paid'`, so an order
      // since marked Evaso dropped out of it: the report's drill-down showed a
      // fraction of the orders behind its own totals. A refunded order stays in,
      // because it was still a sale in the period it settled.
      conds.push(inArray(orders.paymentStatus, ["paid", "refunded"]));
    } else {
      conds.push(eq(orders.status, f.stato as "paid"));
    }
  }
  if (isSet(f.tipo)) conds.push(eq(orders.fulfilment, f.tipo as "pickup"));
  if (f.data === "incasso") {
    // Compared as raw milliseconds, like `getVatReport` does: the left-hand side
    // is an expression, not a column, so there is no driver mapper to turn a
    // Date into the integer the column actually stores.
    if (f.da) conds.push(sql`${ORDER_SETTLED_AT} >= ${romeDayStart(f.da).getTime()}`);
    if (f.a) conds.push(sql`${ORDER_SETTLED_AT} < ${romeDayAfter(f.a).getTime()}`);
  } else {
    if (f.da) conds.push(gte(orders.createdAt, romeDayStart(f.da)));
    if (f.a) conds.push(lt(orders.createdAt, romeDayAfter(f.a)));
  }
  if (f.q) {
    conds.push(
      searchWhere("orders", f.q, () => [
        like(sql`${orders.orderNumber}`, term(f.q!)),
        like(sql`${orders.name}`, term(f.q!)),
        like(sql`${orders.email}`, term(f.q!)),
      ]),
    );
  }
  return conds.length ? and(...conds) : undefined;
}

// ── Reservations ─────────────────────────────────────────────────────────────
export type ReservationFilters = {
  stato?: string;
  negozio?: string;
  tipo?: string;
  q?: string;
  da?: string;
  a?: string;
};

export function reservationFilters(p: ParamBag): ReservationFilters {
  return {
    stato: facet(p, "stato"),
    negozio: facet(p, "negozio"),
    tipo: facet(p, "tipo"),
    q: read(p, "q"),
    da: read(p, "da"),
    a: read(p, "a"),
  };
}

export function reservationsWhere(f: ReservationFilters): SQL | undefined {
  const conds: SQL[] = [];
  // "In lista d'attesa" is a flag, not a status, so it needs its own facet —
  // without one the waitlist existed as a per-row badge and nothing else, and
  // the dashboard card counting it had nowhere to link to.
  if (f.stato === "waitlist") {
    conds.push(eq(reservations.waitlisted, true));
    conds.push(sql`${reservations.status} != 'cancelled'`);
  } else if (isSet(f.stato)) {
    conds.push(eq(reservations.status, f.stato as "pending"));
  }
  if (isSet(f.negozio)) conds.push(eq(reservations.shopSlug, f.negozio));
  if (isSet(f.tipo)) conds.push(eq(reservations.type, f.tipo as "table"));
  if (f.da) conds.push(gte(reservations.date, f.da));
  if (f.a) conds.push(lte(reservations.date, f.a));
  if (f.q) {
    conds.push(
      searchWhere("reservations", f.q, () => [
        like(sql`${reservations.reference}`, term(f.q!)),
        like(sql`${reservations.name}`, term(f.q!)),
        like(sql`${reservations.phone}`, term(f.q!)),
        like(sql`coalesce(${reservations.email}, '')`, term(f.q!)),
      ]),
    );
  }
  return conds.length ? and(...conds) : undefined;
}

// ── Customers (users ⟕ loyalty accounts) ─────────────────────────────────────
/** `ruolo` defaults to real customers — staff are not the shop's clientele. */
export type CustomerFilters = { q?: string; ruolo?: string };

export function customerFilters(p: ParamBag): CustomerFilters {
  return { q: read(p, "q"), ruolo: read(p, "ruolo") ?? "customer" };
}

/** Requires the `loyaltyAccounts` left-join to be present in the query. */
export function customersWhere(f: CustomerFilters): SQL | undefined {
  const conds: SQL[] = [];
  // The "Fedeltà" list counted staff and admins as clienti, so its total
  // disagreed with the dashboard's (which does filter by role) and a staff
  // account could have its points adjusted from a customer screen. "tutti"
  // stays available for the rare case an operator wants every account.
  if (isSet(f.ruolo)) conds.push(eq(users.role, f.ruolo as "customer"));
  if (f.q) {
    conds.push(
      searchWhere(
        "users",
        f.q,
        () => [like(sql`${users.name}`, term(f.q!)), like(sql`${users.username}`, term(f.q!))],
        // Not in the users index — it belongs to the joined loyalty account.
        [like(sql`coalesce(${loyaltyAccounts.cardNumber}, '')`, term(f.q))],
      ),
    );
  }
  return conds.length ? and(...conds) : undefined;
}

// ── Accounts (the Utenti page) ───────────────────────────────────────────────
export type UserFilters = { ruolo?: string; stato?: string; q?: string };

export function userFilters(p: ParamBag): UserFilters {
  return { ruolo: facet(p, "ruolo"), stato: facet(p, "stato"), q: read(p, "q") };
}

export function usersWhere(f: UserFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (isSet(f.ruolo)) conds.push(eq(users.role, f.ruolo as "customer"));
  if (f.stato === "attivi") conds.push(eq(users.active, true));
  if (f.stato === "disattivati") conds.push(eq(users.active, false));
  if (f.stato === "da-verificare") conds.push(sql`${users.emailVerifiedAt} is null`);
  if (f.stato === "con-2fa") conds.push(eq(users.totpEnabled, true));
  if (f.q) {
    conds.push(
      searchWhere("users", f.q, () => [
        like(sql`${users.name}`, term(f.q!)),
        like(sql`${users.username}`, term(f.q!)),
        like(sql`coalesce(${users.email}, '')`, term(f.q!)),
      ]),
    );
  }
  return conds.length ? and(...conds) : undefined;
}

// ── Newsletter subscribers ───────────────────────────────────────────────────
export type SubscriberFilters = { stato?: string; origine?: string; q?: string };

export function subscriberFilters(p: ParamBag): SubscriberFilters {
  return {
    stato: facet(p, "stato"),
    origine: facet(p, "origine"),
    q: read(p, "q"),
  };
}

export function subscribersWhere(f: SubscriberFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (isSet(f.stato)) conds.push(eq(newsletterSubscribers.status, f.stato as "confirmed"));
  if (isSet(f.origine)) conds.push(eq(newsletterSubscribers.source, f.origine));
  if (f.q) {
    conds.push(
      searchWhere("newsletter_subscribers", f.q, () => [
        like(sql`${newsletterSubscribers.email}`, term(f.q!)),
      ]),
    );
  }
  return conds.length ? and(...conds) : undefined;
}

// ── Products (catalogue) ─────────────────────────────────────────────────────
export type ProductFilters = {
  negozio?: string;
  categoria?: string;
  /** all | attivi | disattivati | shop (purchasable online) */
  stato?: string;
  /** all | basse (at/under threshold) | esaurite (0) | illimitate (untracked) */
  scorte?: string;
  q?: string;
};

export function productFilters(p: ParamBag): ProductFilters {
  return {
    negozio: facet(p, "negozio"),
    categoria: facet(p, "categoria"),
    stato: facet(p, "stato"),
    scorte: facet(p, "scorte"),
    q: read(p, "q"),
  };
}

/**
 * `lowStockThreshold` comes from settings rather than the query string — the
 * "scorte basse" facet means "at or under whatever the shop configured".
 */
export function productsWhere(f: ProductFilters, lowStockThreshold: number): SQL | undefined {
  const conds: SQL[] = [];
  // Archived products are out of the catalogue by default — they exist to keep
  // history readable, not to clutter the list an operator works from.
  if (f.stato === "archiviati") {
    conds.push(sql`${products.archivedAt} is not null`);
  } else {
    conds.push(sql`${products.archivedAt} is null`);
  }
  if (isSet(f.negozio)) conds.push(eq(products.shopSlug, f.negozio));
  if (f.categoria === "non-assegnata") {
    // The rows /admin/categories counts and could not show you: a free-text
    // category that matches no entry in the taxonomy. It printed the number and
    // sent you to an unfiltered catalogue to find them by eye.
    conds.push(and(isNull(products.categoryId), ne(products.category, ""))!);
  } else if (isSet(f.categoria)) {
    conds.push(eq(products.category, f.categoria));
  }
  if (f.stato === "attivi") conds.push(eq(products.active, true));
  if (f.stato === "disattivati") conds.push(eq(products.active, false));
  if (f.stato === "shop") conds.push(eq(products.purchasable, true));
  // `stock IS NULL` means unlimited / made-to-order, so it is never "low". A
  // product's own reorder point wins over the shop-wide threshold.
  if (f.scorte === "basse") {
    conds.push(
      sql`${products.stock} is not null and ${products.stock} <= coalesce(${products.reorderPoint}, ${lowStockThreshold})`,
    );
  }
  if (f.scorte === "esaurite") conds.push(sql`${products.stock} is not null and ${products.stock} <= 0`);
  if (f.scorte === "illimitate") conds.push(sql`${products.stock} is null`);
  if (f.q) {
    conds.push(
      or(
        like(sql`${products.name}`, term(f.q)),
        like(sql`${products.slug}`, term(f.q)),
        like(sql`${products.category}`, term(f.q)),
      )!,
    );
  }
  return conds.length ? and(...conds) : undefined;
}

// ── Blog posts ───────────────────────────────────────────────────────────────
export type BlogFilters = { stato?: string; categoria?: string; q?: string };

export function blogFilters(p: ParamBag): BlogFilters {
  return { stato: facet(p, "stato"), categoria: facet(p, "categoria"), q: read(p, "q") };
}

export function blogWhere(f: BlogFilters, today?: string): SQL | undefined {
  const conds: SQL[] = [];
  // "Online" and "programmato" are both `published = true`; the date decides
  // which. Mirrors the public gate in lib/db/queries.ts.
  if (f.stato === "pubblicati") {
    conds.push(eq(blogPosts.published, true));
    if (today) conds.push(lte(blogPosts.date, today));
  }
  if (f.stato === "programmati") {
    conds.push(eq(blogPosts.published, true));
    conds.push(gt(blogPosts.date, today ?? ""));
  }
  if (f.stato === "bozze") conds.push(eq(blogPosts.published, false));
  if (isSet(f.categoria)) conds.push(eq(blogPosts.category, f.categoria));
  if (f.q) {
    conds.push(
      or(
        like(sql`${blogPosts.title}`, term(f.q)),
        like(sql`${blogPosts.slug}`, term(f.q)),
        like(sql`${blogPosts.excerpt}`, term(f.q)),
      )!,
    );
  }
  return conds.length ? and(...conds) : undefined;
}

// ── Rewards ──────────────────────────────────────────────────────────────────
export type RewardFilters = { stato?: string; q?: string };

export function rewardFilters(p: ParamBag): RewardFilters {
  return { stato: facet(p, "stato"), q: read(p, "q") };
}

export function rewardsWhere(f: RewardFilters, now: Date = new Date()): SQL | undefined {
  const conds: SQL[] = [];
  if (f.stato === "attivi") conds.push(eq(rewards.active, true));
  if (f.stato === "disattivati") conds.push(eq(rewards.active, false));
  // The two states an operator actually has to act on, and which the list used
  // to render identically to a healthy reward: nothing left to hand over, and
  // a seasonal window that has closed.
  if (f.stato === "esauriti") {
    conds.push(and(eq(rewards.active, true), sql`${rewards.stock} is not null and ${rewards.stock} <= 0`)!);
  }
  if (f.stato === "scaduti") {
    conds.push(
      and(
        eq(rewards.active, true),
        sql`${rewards.availableUntil} is not null and ${rewards.availableUntil} < ${now.getTime()}`,
      )!,
    );
  }
  if (f.q) {
    conds.push(or(like(sql`${rewards.name}`, term(f.q)), like(sql`${rewards.slug}`, term(f.q)))!);
  }
  return conds.length ? and(...conds) : undefined;
}

// ── Discount codes ───────────────────────────────────────────────────────────
export type DiscountFilters = { stato?: string; tipo?: string; q?: string };

export function discountFilters(p: ParamBag): DiscountFilters {
  return { stato: facet(p, "stato"), tipo: facet(p, "tipo"), q: read(p, "q") };
}

export function discountsWhere(f: DiscountFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.stato === "attivi") conds.push(eq(discountCodes.active, true));
  if (f.stato === "disattivati") conds.push(eq(discountCodes.active, false));
  // A capped code that has reached its limit: still "active" but unusable.
  if (f.stato === "esauriti") {
    conds.push(
      sql`${discountCodes.maxRedemptions} is not null and ${discountCodes.timesUsed} >= ${discountCodes.maxRedemptions}`,
    );
  }
  if (isSet(f.tipo)) conds.push(eq(discountCodes.type, f.tipo as "percent"));
  if (f.q) conds.push(like(sql`${discountCodes.code}`, term(f.q)));
  return conds.length ? and(...conds) : undefined;
}

// ── Audit log ────────────────────────────────────────────────────────────────
export type AuditFilters = {
  entity?: string;
  /** Actor id, so two staff with the same display name stay distinct. */
  attore?: string;
  /**
   * One record's whole history.
   *
   * The log could always link *out* to the order, product or booking an entry
   * touched, and there was no way back: nothing pointed from a record to what
   * had been done to it, and no filter could express it, so the only route was
   * pasting an id into the free-text box. This is the facet the "Cronologia"
   * link on every detail page uses.
   */
  record?: string;
  q?: string;
  da?: string;
  a?: string;
};

export function auditFilters(p: ParamBag): AuditFilters {
  return {
    entity: facet(p, "entity"),
    attore: facet(p, "attore"),
    record: read(p, "record"),
    q: read(p, "q"),
    da: read(p, "da"),
    a: read(p, "a"),
  };
}

export function auditWhere(f: AuditFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (isSet(f.entity)) conds.push(eq(auditLog.entity, f.entity));
  if (isSet(f.attore)) conds.push(eq(auditLog.actorId, f.attore));
  if (f.record) conds.push(eq(auditLog.entityId, f.record));
  // Date bounds are whole days in the operator's calendar: `a` is inclusive.
  if (f.da) conds.push(gte(auditLog.createdAt, romeDayStart(f.da)));
  if (f.a) conds.push(lt(auditLog.createdAt, romeDayAfter(f.a)));
  if (f.q) {
    conds.push(
      searchWhere("audit_log", f.q, () => [
        like(sql`${auditLog.summary}`, term(f.q!)),
        like(sql`${auditLog.action}`, term(f.q!)),
        like(sql`coalesce(${auditLog.entityId}, '')`, term(f.q!)),
      ]),
    );
  }
  return conds.length ? and(...conds) : undefined;
}

// ── Email outbox ─────────────────────────────────────────────────────────────
export type OutboxFilters = { stato?: string; q?: string };

export function outboxFilters(p: ParamBag): OutboxFilters {
  return { stato: facet(p, "stato"), q: read(p, "q") };
}

export function outboxWhere(f: OutboxFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (isSet(f.stato)) conds.push(eq(emailOutbox.status, f.stato as "sent"));
  if (f.q) {
    conds.push(
      or(
        like(sql`${emailOutbox.toAddress}`, term(f.q)),
        like(sql`${emailOutbox.subject}`, term(f.q)),
      )!,
    );
  }
  return conds.length ? and(...conds) : undefined;
}
