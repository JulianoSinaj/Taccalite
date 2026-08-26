import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { discountCodes, discountRedemptions, orders, type DiscountCodeRow } from "@/lib/db/schema";

export type AppliedDiscount = {
  id: string;
  code: string;
  /** Amount taken off the subtotal, in cents (0 for a free-shipping code). */
  discountCents: number;
  /** True when the code waives shipping. */
  freeShipping: boolean;
};

/** Who is trying to use a code, for per-customer and first-order rules. */
export type DiscountCustomer = {
  userId?: string | null;
  email?: string | null;
  shopSlug?: string | null;
};

/** Normalise a user-entered code to the stored form (uppercase, trimmed). */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Validate a discount code against an order subtotal and return the concrete
 * amount it takes off (and whether it waives shipping). Returns null when the
 * code is unknown, inactive, out of its validity window, over a cap, scoped to
 * another shop, restricted to first orders, or the subtotal is below its
 * minimum. Never throws — the caller treats a null result as "no discount".
 *
 * The subtotal is VAT-inclusive (gross), matching how catalogue prices are
 * stored; the discount therefore reduces the gross the customer pays.
 */
export async function validateDiscount(
  rawCode: string | undefined | null,
  subtotalCents: number,
  customer: DiscountCustomer = {},
  now: Date = new Date(),
): Promise<AppliedDiscount | null> {
  if (!rawCode) return null;
  const code = normalizeCode(rawCode);
  if (!code) return null;

  const [row] = await db
    .select()
    .from(discountCodes)
    .where(and(eq(discountCodes.code, code), eq(discountCodes.active, true)))
    .limit(1);
  if (!row) return null;

  if (row.startsAt && now < row.startsAt) return null;
  if (row.endsAt && now > row.endsAt) return null;
  if (row.maxRedemptions != null && row.timesUsed >= row.maxRedemptions) return null;
  if (subtotalCents < row.minSubtotalCents) return null;
  // Scoped to one location.
  if (row.shopSlug && customer.shopSlug && row.shopSlug !== customer.shopSlug) return null;
  if (row.shopSlug && !customer.shopSlug) return null;

  // Per-customer cap, counted from the redemption ledger. Guests are identified
  // by order email — imperfect, but it stops the obvious recycling of a
  // one-per-customer code.
  if (row.maxPerCustomer != null && (customer.userId || customer.email)) {
    const used = await countCustomerUses(code, customer);
    if (used >= row.maxPerCustomer) return null;
  }

  // First-order-only: any previously settled order disqualifies.
  if (row.firstOrderOnly && (customer.userId || customer.email)) {
    if (await hasPreviousOrder(customer)) return null;
  }

  let discountCents = 0;
  let freeShipping = false;
  if (row.type === "percent") {
    discountCents = Math.round((subtotalCents * row.value) / 100);
  } else if (row.type === "fixed") {
    discountCents = Math.min(row.value, subtotalCents);
  } else {
    freeShipping = true;
  }
  // Never discount more than the subtotal.
  discountCents = Math.max(0, Math.min(discountCents, subtotalCents));

  return { id: row.id, code, discountCents, freeShipping };
}

/** How many times this customer has already used a code (cancelled uses freed). */
async function countCustomerUses(code: string, customer: DiscountCustomer): Promise<number> {
  const who = customer.userId
    ? eq(discountRedemptions.userId, customer.userId)
    : eq(discountRedemptions.email, (customer.email ?? "").toLowerCase());
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(discountRedemptions)
    .where(and(eq(discountRedemptions.discountCode, code), who));
  return row?.n ?? 0;
}

/** True when this customer has settled an order before. */
async function hasPreviousOrder(customer: DiscountCustomer): Promise<boolean> {
  const who = customer.userId
    ? eq(orders.userId, customer.userId)
    : eq(sql`lower(${orders.email})`, (customer.email ?? "").toLowerCase());
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(and(who, or(eq(orders.paymentStatus, "paid"), eq(orders.paymentStatus, "refunded"))));
  return (row?.n ?? 0) > 0;
}

/**
 * Count a redemption, **atomically respecting the cap**.
 *
 * The increment is conditional on the code still being under its limit, so two
 * checkouts settling at the same moment can't both take the last use of a
 * `maxRedemptions = 1` code — the previous unconditional `timesUsed + 1` left
 * that race open between `validateDiscount` and here.
 *
 * Also writes the redemption ledger, which is what makes a per-customer cap
 * enforceable and answers "which orders used this code" — a bare counter never
 * could. Best-effort: bookkeeping must not fail a paid order.
 *
 * The ledger row is written **only when the claim succeeded**, in the same
 * transaction, so "this order has a ledger row" and "this order is counted in
 * `timesUsed`" can never disagree. That equivalence is load-bearing: it is the
 * only signal `releaseDiscountUseByCode` has to tell a use that was taken from
 * one that was refused. Writing the row either way let a refund give back a use
 * the order never took, and a one-shot code could then be redeemed twice.
 *
 * Returns false when the cap was already reached (the order still stands; the
 * discount was granted at validation time and honouring it is the right call).
 */
export async function recordDiscountUseByCode(
  code: string,
  ctx: { orderId?: string; userId?: string | null; email?: string | null; amountCents?: number } = {},
): Promise<boolean> {
  const normalized = normalizeCode(code);
  try {
    return await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(discountCodes)
        .set({ timesUsed: sql`${discountCodes.timesUsed} + 1` })
        .where(
          and(
            eq(discountCodes.code, normalized),
            // Unlimited, or still under the cap — checked in the same statement
            // that increments, so it can't be raced.
            or(
              isNull(discountCodes.maxRedemptions),
              sql`${discountCodes.timesUsed} < ${discountCodes.maxRedemptions}`,
            ),
          ),
        )
        .returning({ id: discountCodes.id });
      if (!claimed) return false;

      await tx.insert(discountRedemptions).values({
        discountCode: normalized,
        orderId: ctx.orderId ?? null,
        userId: ctx.userId ?? null,
        email: ctx.email ? ctx.email.toLowerCase() : null,
        amountCents: ctx.amountCents ?? 0,
      });

      return true;
    });
  } catch {
    /* usage bookkeeping is non-fatal */
    return false;
  }
}

/** Count a redemption by id (the manual-order path, which holds the row). */
export async function recordDiscountUse(
  id: string,
  ctx: { orderId?: string; userId?: string | null; email?: string | null; amountCents?: number } = {},
): Promise<void> {
  try {
    const [row] = await db
      .select({ code: discountCodes.code })
      .from(discountCodes)
      .where(eq(discountCodes.id, id))
      .limit(1);
    if (row) await recordDiscountUseByCode(row.code, ctx);
  } catch {
    /* non-fatal */
  }
}

/**
 * Release a redemption by code (used when a paid order is refunded/cancelled so a
 * capped code isn't permanently burned). Floored at 0. Best-effort.
 *
 * The ledger row is deleted first, and `timesUsed` is decremented by however many
 * rows that actually removed — never blindly by one. An order that settled while
 * the code was already at its cap was honoured but not counted (see
 * `recordDiscountUseByCode`), so it has no ledger row and must give nothing back.
 * Decrementing unconditionally handed a use back for it, which is how a
 * `maxRedemptions = 1` code became redeemable again after that order was
 * refunded — with the first, genuine redemption still standing.
 *
 * `orderId` is required for the same reason: it is the anchor that says which
 * use is being reversed, and without it there is no way to tell a counted
 * redemption from a refused one.
 */
export async function releaseDiscountUseByCode(code: string, orderId: string): Promise<void> {
  const normalized = normalizeCode(code);
  try {
    await db.transaction(async (tx) => {
      const removed = await tx
        .delete(discountRedemptions)
        .where(
          and(eq(discountRedemptions.discountCode, normalized), eq(discountRedemptions.orderId, orderId)),
        );
      // Also what frees a per-customer cap: that is counted from the ledger, not
      // from `timesUsed`, so the two have to move together.
      const taken = removed.rowsAffected;
      if (taken > 0) {
        await tx
          .update(discountCodes)
          .set({ timesUsed: sql`max(0, ${discountCodes.timesUsed} - ${taken})` })
          .where(eq(discountCodes.code, normalized));
      }
    });
  } catch {
    /* usage bookkeeping is non-fatal */
  }
}

/** The orders a code was used on, newest first — the drill-down behind `timesUsed`. */
export function getDiscountUses(code: string, opts: { limit?: number; offset?: number } = {}) {
  return db
    .select({
      redemption: discountRedemptions,
      orderNumber: orders.orderNumber,
      orderTotalCents: orders.totalCents,
      orderStatus: orders.status,
    })
    .from(discountRedemptions)
    .leftJoin(orders, eq(discountRedemptions.orderId, orders.id))
    .where(eq(discountRedemptions.discountCode, normalizeCode(code)))
    .orderBy(desc(discountRedemptions.createdAt), discountRedemptions.id)
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);
}

/** Ledger rows and the money they represent, for a code's summary line. */
export async function summarizeDiscountUses(code: string): Promise<{ count: number; amountCents: number }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      amountCents: sql<number>`coalesce(sum(${discountRedemptions.amountCents}), 0)`,
    })
    .from(discountRedemptions)
    .where(eq(discountRedemptions.discountCode, normalizeCode(code)));
  return { count: Number(row?.count ?? 0), amountCents: Number(row?.amountCents ?? 0) };
}

/**
 * Why a code can (or cannot) be redeemed right now. One state per code, in the
 * order `validateDiscount` refuses: switched off, past its end date, out of
 * uses, not yet started — otherwise live. `discountsWhere` mirrors these rules
 * in SQL so a code sits under exactly one status chip on the admin list.
 */
export type DiscountState = "inactive" | "expired" | "exhausted" | "scheduled" | "active";

export function discountState(
  row: Pick<DiscountCodeRow, "active" | "startsAt" | "endsAt" | "maxRedemptions" | "timesUsed">,
  now: Date = new Date(),
): DiscountState {
  if (!row.active) return "inactive";
  if (row.endsAt && now > row.endsAt) return "expired";
  if (row.maxRedemptions != null && row.timesUsed >= row.maxRedemptions) return "exhausted";
  if (row.startsAt && now < row.startsAt) return "scheduled";
  return "active";
}
