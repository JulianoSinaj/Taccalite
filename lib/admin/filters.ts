import "server-only";
import { and, asc, desc, eq, gte, like, lte, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { ftsMatch, type FtsTable } from "@/lib/admin/search";
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

// ── Orders ───────────────────────────────────────────────────────────────────
/** Facets are optional so an internal caller can build a partial filter (an
 *  absent facet means "all", exactly like the query-string default). */
export type OrderFilters = {
  negozio?: string;
  stato?: string;
  tipo?: string;
  q?: string;
};

export function orderFilters(p: ParamBag): OrderFilters {
  return {
    negozio: facet(p, "negozio"),
    stato: facet(p, "stato"),
    tipo: facet(p, "tipo"),
    q: read(p, "q"),
  };
}

export function ordersWhere(f: OrderFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (isSet(f.negozio)) conds.push(eq(orders.shopSlug, f.negozio));
  if (isSet(f.stato)) {
    // "to-fulfil" is a work-queue view, not a stored status: paid but not yet
    // handed over.
    conds.push(eq(orders.status, (f.stato === "to-fulfil" ? "paid" : f.stato) as "paid"));
  }
  if (isSet(f.tipo)) conds.push(eq(orders.fulfilment, f.tipo as "pickup"));
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
  if (isSet(f.stato)) conds.push(eq(reservations.status, f.stato as "pending"));
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
export type CustomerFilters = { q?: string };

export function customerFilters(p: ParamBag): CustomerFilters {
  return { q: read(p, "q") };
}

/** Requires the `loyaltyAccounts` left-join to be present in the query. */
export function customersWhere(f: CustomerFilters): SQL | undefined {
  if (!f.q) return undefined;
  return searchWhere(
    "users",
    f.q,
    () => [like(sql`${users.name}`, term(f.q!)), like(sql`${users.username}`, term(f.q!))],
    // Not in the users index — it belongs to the joined loyalty account.
    [like(sql`coalesce(${loyaltyAccounts.cardNumber}, '')`, term(f.q))],
  );
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
  if (isSet(f.negozio)) conds.push(eq(products.shopSlug, f.negozio));
  if (isSet(f.categoria)) conds.push(eq(products.category, f.categoria));
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

export function blogWhere(f: BlogFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.stato === "pubblicati") conds.push(eq(blogPosts.published, true));
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

export function rewardsWhere(f: RewardFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.stato === "attivi") conds.push(eq(rewards.active, true));
  if (f.stato === "disattivati") conds.push(eq(rewards.active, false));
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
  q?: string;
  da?: string;
  a?: string;
};

export function auditFilters(p: ParamBag): AuditFilters {
  return {
    entity: facet(p, "entity"),
    attore: facet(p, "attore"),
    q: read(p, "q"),
    da: read(p, "da"),
    a: read(p, "a"),
  };
}

export function auditWhere(f: AuditFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (isSet(f.entity)) conds.push(eq(auditLog.entity, f.entity));
  if (isSet(f.attore)) conds.push(eq(auditLog.actorId, f.attore));
  // Date bounds are whole days in the operator's calendar: `a` is inclusive.
  if (f.da) conds.push(gte(auditLog.createdAt, new Date(`${f.da}T00:00:00`)));
  if (f.a) conds.push(lte(auditLog.createdAt, new Date(`${f.a}T23:59:59.999`)));
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
