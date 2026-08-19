import "server-only";
import { customAlphabet } from "nanoid";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems, products } from "@/lib/db/schema";
import { applyStockChange, consumeBatchesFefo, restoreBatches } from "@/lib/stock";
import { getShopBySlug, getSetting } from "@/lib/db/queries";
import { validateDiscount, recordDiscountUseByCode, releaseDiscountUseByCode } from "@/lib/discounts";
import { sendMail } from "@/lib/mail/mailer";
import { orderCustomerEmail, orderOwnerEmail, lowStockOwnerEmail, type OrderEmailData } from "@/lib/mail/templates";
import { addPoints } from "@/lib/loyalty";
import { isLowStock } from "@/lib/inventory";
import { env } from "@/lib/env";
import type { CheckoutInput } from "@/lib/validation/order";

const SHIPPING_CENTS = 700; // flat shipping fee
const orderCode = customAlphabet("0123456789", 6); // ~1M namespace/year

export function generateOrderNumber(): string {
  return `ORD-${new Date().getFullYear()}-${orderCode()}`;
}

/** True when an error is the unique-constraint violation on orders.order_number. */
function isDuplicateOrderNumber(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed:\s*orders\.order_number/i.test(err.message);
}

export type CreatedOrder = {
  orderId: string;
  orderNumber: string;
  totalCents: number;
  items: { name: string; quantity: number; lineTotalCents: number }[];
};

/**
 * Server-authoritative order creation: prices come from the DB, never the client.
 */
export async function createOrder(input: CheckoutInput, userId?: string): Promise<CreatedOrder> {
  const slugs = input.items.map((i) => i.slug);
  const dbProducts = await db
    .select()
    .from(products)
    .where(and(eq(products.purchasable, true), eq(products.active, true), inArray(products.slug, slugs)));

  const priceMap = new Map(dbProducts.map((p) => [p.slug, p]));
  const lines = input.items
    .map((i) => {
      const p = priceMap.get(i.slug);
      if (!p || p.priceCents == null) return null;
      return {
        product: p,
        quantity: i.quantity,
        unitPriceCents: p.priceCents,
        lineTotalCents: p.priceCents * i.quantity,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (lines.length === 0) throw new Error("Nessun prodotto valido nel carrello");

  // Refuse to oversell stock-tracked products. Stock is only decremented at
  // payment, so without this a stale cart / direct POST / concurrent buyer could
  // place a paid order for more than exists (the decrement just floors at 0).
  const shortages = lines.filter((l) => l.product.stock != null && l.product.stock < l.quantity);
  if (shortages.length > 0) {
    const names = shortages
      .map((l) => `${l.product.name} (disponibili: ${l.product.stock})`)
      .join(", ");
    throw new Error(`Scorte insufficienti per: ${names}`);
  }

  // For pickup, the chosen shop must exist and have the store enabled.
  if (input.fulfilment === "pickup") {
    if (!input.shopSlug) throw new Error("Scegli un negozio per il ritiro");
    const shop = await getShopBySlug(input.shopSlug);
    if (!shop) throw new Error("Negozio di ritiro non valido");
    if (!shop.storeEnabled) throw new Error("Questa sede non offre il ritiro in negozio");
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  // Discount code (optional). Validated server-side against the DB subtotal — a
  // client-supplied code can never fabricate a discount. A free-shipping code
  // waives the fee below; a percent/fixed code reduces the subtotal.
  const discount = await validateDiscount(input.discountCode, subtotalCents, {
    userId,
    email: input.email,
    shopSlug: input.fulfilment === "pickup" ? input.shopSlug : null,
  });
  const discountCents = discount?.discountCents ?? 0;

  // Shipping is configurable from admin settings. It applies only to shipping
  // orders, and is waived once the subtotal reaches the free-shipping threshold
  // (a threshold of 0 disables free shipping) or when a free-shipping code applies.
  const flatShippingCents = await getSetting<number>("store.shippingCents", SHIPPING_CENTS);
  const freeShippingThresholdCents = await getSetting<number>("store.freeShippingThresholdCents", 0);
  const shippingCents =
    input.fulfilment === "shipping" &&
    !discount?.freeShipping &&
    (freeShippingThresholdCents === 0 || subtotalCents < freeShippingThresholdCents)
      ? flatShippingCents
      : 0;
  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

  // Insert the order and its line items atomically — no zero-item orders. The
  // order number is random, so on the (rare) unique-constraint collision we
  // regenerate and retry rather than failing the checkout.
  const MAX_ATTEMPTS = 5;
  let orderNumber = "";
  let order: { id: string } | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    orderNumber = generateOrderNumber();
    try {
      order = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(orders)
          .values({
            orderNumber,
            userId: userId ?? null,
            email: input.email,
            name: input.name,
            phone: input.phone ?? null,
            status: "pending",
            fulfilment: input.fulfilment,
            shopSlug: input.fulfilment === "pickup" ? input.shopSlug ?? null : null,
            shippingAddress:
              input.fulfilment === "shipping"
                ? { address: input.address ?? "", city: input.city ?? "", zip: input.zip ?? "" }
                : null,
            subtotalCents,
            shippingCents,
            discountCode: discount?.code ?? null,
            discountCents,
            totalCents,
            paymentStatus: "unpaid",
            notes: input.notes ?? null,
          })
          .returning({ id: orders.id })
;

        await tx.insert(orderItems)
          .values(
            lines.map((l) => ({
              orderId: created.id,
              productId: l.product.id,
              productSlug: l.product.slug,
              name: l.product.name,
              unitPriceCents: l.unitPriceCents,
              quantity: l.quantity,
              lineTotalCents: l.lineTotalCents,
              vatRateBps: l.product.vatRateBps,
            })),
          )
;

        return created;
      });
      break;
    } catch (err) {
      if (isDuplicateOrderNumber(err) && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }
  }

  if (!order) throw new Error("Impossibile generare un numero d'ordine univoco");

  // NB: the coupon is counted when the order is *paid* (see finalizeOrder), not
  // here — otherwise an abandoned/cancelled checkout would permanently burn a
  // redemption and a capped code could be exhausted by shoppers who never pay.

  return {
    orderId: order.id,
    orderNumber,
    totalCents,
    items: lines.map((l) => ({ name: l.product.name, quantity: l.quantity, lineTotalCents: l.lineTotalCents })),
  };
}

export type RecalcResult = {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  /** Set when a previously-applied coupon no longer qualifies (e.g. the edited
   *  subtotal fell below its minimum, or it expired since the order was placed).
   *  The caller surfaces this — the discount is dropped, not silently kept. */
  droppedDiscountCode?: string;
};

/**
 * Recompute an order's money from its *current* line items, fulfilment and
 * coupon, and persist the result. The single pricing authority for edits, using
 * the same rules as checkout: prices come from the stored lines, shipping from
 * settings, and the coupon is re-validated against the new subtotal.
 *
 * Callers must restrict this to orders that have not been paid — a paid order's
 * total is what the customer was actually charged, and rewriting it would
 * desynchronise the books from the payment.
 */
export async function recalcOrderTotals(orderId: string): Promise<RecalcResult> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Ordine non trovato");

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);

  // Re-validate the coupon against the new subtotal. A code that no longer
  // qualifies is dropped rather than carried over at its old value.
  const discount = order.discountCode
    ? await validateDiscount(order.discountCode, subtotalCents)
    : null;
  const discountCents = discount?.discountCents ?? 0;
  const droppedDiscountCode = order.discountCode && !discount ? order.discountCode : undefined;

  const flatShippingCents = await getSetting<number>("store.shippingCents", SHIPPING_CENTS);
  const freeShippingThresholdCents = await getSetting<number>("store.freeShippingThresholdCents", 0);
  const shippingCents =
    order.fulfilment === "shipping" &&
    !discount?.freeShipping &&
    (freeShippingThresholdCents === 0 || subtotalCents < freeShippingThresholdCents)
      ? flatShippingCents
      : 0;

  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

  await db
    .update(orders)
    .set({
      subtotalCents,
      discountCents,
      discountCode: discount?.code ?? null,
      shippingCents,
      totalCents,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  return { subtotalCents, discountCents, shippingCents, totalCents, droppedDiscountCode };
}

/** A customer's recent orders for their account history (newest first). */
export async function getOrdersForUser(userId: string) {
  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      status: orders.status,
      totalCents: orders.totalCents,
      fulfilment: orders.fulfilment,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(20);
}

export type OrderWithItems = {
  order: typeof orders.$inferSelect;
  items: (typeof orderItems.$inferSelect)[];
};

/**
 * Fetch an order + its items for display, but ONLY for a viewer entitled to see
 * it. Order numbers (`ORD-YYYY-NNNN`) are guessable, so the contents must never
 * be exposed on the number alone. A viewer is entitled when:
 *  - they hold the order's unguessable id as a token (the simulate-checkout
 *    redirect and any owner link carry it), OR
 *  - a server-verified Stripe session resolved to this order in this request, OR
 *  - they are the logged-in customer who placed it.
 * Returns null otherwise (caller shows a generic confirmation with no details).
 */
export async function getOrderForViewer(
  orderNumber: string | undefined,
  opts: { token?: string | null; verifiedOrderId?: string | null; viewerUserId?: string | null },
): Promise<OrderWithItems | null> {
  if (!orderNumber) return null;
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order) return null;

  const entitled =
    (!!opts.token && opts.token === order.id) ||
    (!!opts.verifiedOrderId && opts.verifiedOrderId === order.id) ||
    (!!order.userId && !!opts.viewerUserId && order.userId === opts.viewerUserId);
  if (!entitled) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { order, items };
}

/**
 * Idempotently finalize a paid order: mark paid, email customer + owner, award
 * loyalty points. Safe to call more than once (webhook + success page).
 */
export async function finalizeOrder(
  orderId: string,
  opts: { paymentIntentId?: string | null } = {},
): Promise<void> {
  // Atomically claim the order: flip unpaid → paid only if it isn't already paid.
  // Only the caller whose UPDATE actually changed a row proceeds to award points
  // and email, so concurrent webhook + success-page calls can't double-accrue.
  const now = new Date();
  const [claimed] = await db
    .update(orders)
    .set({
      status: "paid",
      paymentStatus: "paid",
      paidAt: now,
      updatedAt: now,
      // Recorded here because this is the first point at which a PaymentIntent
      // exists; refund events later arrive keyed on it.
      ...(opts.paymentIntentId ? { stripePaymentIntentId: opts.paymentIntentId } : {}),
    })
    .where(and(eq(orders.id, orderId), ne(orders.paymentStatus, "paid")))
    .returning({ id: orders.id })
;
  if (!claimed) {
    // Losing the claim race still shouldn't lose the PaymentIntent: backfill it
    // if the winner didn't have one (e.g. the success page finalized first).
    if (opts.paymentIntentId) {
      await db
        .update(orders)
        .set({ stripePaymentIntentId: opts.paymentIntentId })
        .where(and(eq(orders.id, orderId), sql`${orders.stripePaymentIntentId} is null`));
    }
    return;
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;

  // Count the coupon now that the order is actually paid (idempotent: the claim
  // above lets only the first finalize proceed).
  if (order.discountCode) {
    await recordDiscountUseByCode(order.discountCode, {
      orderId: order.id,
      userId: order.userId,
      email: order.email,
      amountCents: order.discountCents,
    });
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const shop = order.shopSlug ? await getShopBySlug(order.shopSlug) : null;

  const emailData: OrderEmailData = {
    orderNumber: order.orderNumber,
    name: order.name,
    email: order.email,
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, lineTotalCents: i.lineTotalCents })),
    totalCents: order.totalCents,
    fulfilment: order.fulfilment,
    shopName: shop?.name ?? null,
  };

  await Promise.allSettled([
    sendMail({ to: order.email, ...orderCustomerEmail(emailData) }),
    sendMail({ to: env.ownerEmail, ...orderOwnerEmail(emailData) }),
  ]);

  // Loyalty accrual for logged-in customers, when the programme is enabled.
  const loyaltyEnabled = await getSetting<boolean>("loyalty.enabled", true);
  if (loyaltyEnabled && order.userId) {
    const perEuro = await getSetting<number>("loyalty.pointsPerEuro", 1);
    const points = Math.floor((order.subtotalCents / 100) * (perEuro || 1));
    if (points > 0) await addPoints(order.userId, points, `Ordine ${order.orderNumber}`);
  }

  // Best-effort stock decrement + low-stock owner alert. Anything here is
  // non-fatal: a paid order must never be un-finalized because inventory
  // bookkeeping or an email failed.
  try {
    // Aggregate ordered quantity per product (an order could list a product
    // across more than one line).
    const qtyByProduct = new Map<string, number>();
    for (const it of items) {
      if (!it.productId) continue;
      qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + it.quantity);
    }

    if (qtyByProduct.size > 0) {
      const threshold = await getSetting<number>("store.lowStockThreshold", 5);
      const lowStock: { name: string; stock: number }[] = [];
      const notifyIds: string[] = [];

      for (const [productId, qty] of qtyByProduct) {
        // One atomic read-modify-write that ledgers the delta ACTUALLY applied,
        // so the movement history always sums to the balance even if the order
        // oversold (createOrder guards against that, but a concurrent buyer can
        // still race it).
        const change = await applyStockChange({
          productId,
          delta: -qty,
          reason: `Ordine ${order.orderNumber}`,
        });
        if (!change) continue;
        // Lot-level bookkeeping, earliest expiry first.
        await consumeBatchesFefo(productId, -change.applied);

        const [updated] = await db
          .select({
            name: products.name,
            stock: products.stock,
            reorderPoint: products.reorderPoint,
            lowStockNotifiedAt: products.lowStockNotifiedAt,
          })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);
        if (!updated || updated.stock == null) continue;

        // Alert once per dip: collect products now at/under the threshold that
        // haven't already been notified. Stamping lowStockNotifiedAt below
        // stops a single dip from spamming repeat alerts on later orders. When
        // an admin restocks a product back above the threshold, that stamp
        // should be reset to null so a future dip can alert again — that reset
        // lives in the product-update action (lib/admin/actions.ts, owned by
        // another agent) and is intentionally not handled here.
        if (isLowStock(updated, threshold) && updated.lowStockNotifiedAt == null) {
          lowStock.push({ name: updated.name, stock: updated.stock });
          notifyIds.push(productId);
        }
      }

      if (notifyIds.length > 0) {
        await sendMail({ to: env.ownerEmail, ...lowStockOwnerEmail(lowStock) });
        await db.update(products)
          .set({ lowStockNotifiedAt: new Date() })
          .where(inArray(products.id, notifyIds))
;
      }
    }
  } catch {
    // Swallowed on purpose — stock/alert bookkeeping is best-effort.
  }
}

export type RefundOutcome = {
  /** Amount newly given back on this call, in cents (0 when nothing changed). */
  deltaCents: number;
  /** Cumulative refunded amount after this call. */
  refundedCents: number;
  /** True when the order is now refunded in full. */
  full: boolean;
};

/**
 * Record a refund against an order, in cents, **cumulatively**.
 *
 * `refundedTotalCents` is the total ever refunded for this order, not the
 * increment — the same shape Stripe's `charge.amount_refunded` uses. That makes
 * the operation idempotent: replaying a webhook, or an admin refund racing the
 * webhook that reports it, converges on the same state instead of double-counting.
 *
 * Reversal side-effects (restock, freeing the coupon) fire only on the
 * transition to a *full* refund, and only once: partially refunding an order
 * doesn't mean the goods came back, and a coupon can't be half-returned.
 *
 * Returns `deltaCents: 0` when the call was a no-op, so callers can skip
 * emailing/audit-logging a refund that had already been recorded.
 */
export async function recordRefund(
  orderId: string,
  refundedTotalCents: number,
  opts: { reason: string; actorId?: string | null } = { reason: "Rimborso" },
): Promise<RefundOutcome | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;

  const capped = Math.max(0, Math.min(Math.round(refundedTotalCents), order.totalCents));
  const deltaCents = capped - order.refundedCents;
  if (deltaCents <= 0) {
    return { deltaCents: 0, refundedCents: order.refundedCents, full: order.paymentStatus === "refunded" };
  }

  const full = capped >= order.totalCents;
  const wasFull = order.paymentStatus === "refunded";

  // Claim the transition atomically on the previous refunded amount, so two
  // concurrent reversals can't both run the restock. `refundedAt` is stamped on
  // every increment: the VAT report books the reversal as a credit note in the
  // period the money went back, so the *latest* refund date is the one that
  // matters for the outstanding balance.
  const [claimed] = await db
    .update(orders)
    .set({
      refundedCents: capped,
      refundedAt: new Date(),
      updatedAt: new Date(),
      ...(full ? ({ status: "refunded", paymentStatus: "refunded" } as const) : {}),
    })
    .where(and(eq(orders.id, orderId), eq(orders.refundedCents, order.refundedCents)))
    .returning({ id: orders.id })
;
  if (!claimed) return { deltaCents: 0, refundedCents: order.refundedCents, full: wasFull };

  if (full && !wasFull) {
    await restockOrderItems(orderId, opts.reason, opts.actorId ?? null);
    if (order.discountCode) await releaseDiscountUseByCode(order.discountCode, order.id);
  }

  return { deltaCents, refundedCents: capped, full };
}

/**
 * Abandon an order whose Stripe Checkout Session expired.
 *
 * Nothing was charged and nothing was reserved (stock is only decremented at
 * finalize, and the coupon is only counted there too), so this just clears the
 * order out of the work queue instead of leaving a "pending" row the operator
 * has to reason about forever. Never touches an order that did get paid.
 */
export async function expireOrder(orderId: string): Promise<boolean> {
  const [claimed] = await db
    .update(orders)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.status, "pending"),
        eq(orders.paymentStatus, "unpaid"),
      ),
    )
    .returning({ id: orders.id })
;
  return !!claimed;
}

/**
 * Return an order's goods to stock (used when a paid order is refunded or
 * cancelled). Increments each stock-tracked product atomically and writes a
 * compensating `stock_movements` row so the ledger reconciles. Best-effort:
 * inventory bookkeeping must never block the refund/cancel itself. Callers must
 * ensure this runs at most once per reversal (it is not itself idempotent).
 */
export async function restockOrderItems(
  orderId: string,
  reason: string,
  byUserId?: string | null,
): Promise<void> {
  try {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const qtyByProduct = new Map<string, number>();
    for (const it of items) {
      if (!it.productId) continue;
      qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + it.quantity);
    }
    for (const [productId, qty] of qtyByProduct) {
      const change = await applyStockChange({ productId, delta: qty, reason, byUserId });
      if (change) await restoreBatches(productId, change.applied);
    }
  } catch {
    // Best-effort — a refund must not fail because inventory bookkeeping did.
  }
}
