import "server-only";
import { customAlphabet } from "nanoid";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems, products } from "@/lib/db/schema";
import { applyStockChange, consumeBatchesFefo, restoreBatches, stockUnitsForLine } from "@/lib/stock";
import {
  getShopBySlug,
  getSetting,
  getDeliveryZones,
  getPickupSlots,
  getPickupSlotCounts,
  getClosures,
} from "@/lib/db/queries";
import { quoteFulfilment, billableWeightKg, needsAddress, type ZoneLike } from "@/lib/fulfilment";
import { resolvePickupSlot, formatSlotLabel } from "@/lib/pickup-slots";
import {
  validateDiscount,
  recordDiscountUseByCode,
  releaseDiscountUseByCode,
  normalizeCode,
} from "@/lib/discounts";
import { sendMail } from "@/lib/mail/mailer";
import {
  orderCustomerEmail,
  orderOwnerEmail,
  orderAwaitingPaymentEmail,
  lowStockOwnerEmail,
  type OrderEmailData,
} from "@/lib/mail/templates";
import {
  paymentMethodError,
  settlesOnHandover,
  type PaymentInstrument,
  type CustomerPaymentMethod,
} from "@/lib/payments/methods";
import { getPaymentAvailability } from "@/lib/payments/config";
import { addPoints } from "@/lib/loyalty";
import { isLowStock } from "@/lib/inventory";
import { env } from "@/lib/env";
import type { CheckoutInput } from "@/lib/validation/order";

const SHIPPING_CENTS = 700; // flat fee, still the seed for the catch-all zone

export type CarriageLine = {
  quantity: number;
  weightKg?: number | null;
  soldByWeight: boolean;
  unit?: string | null;
};

export type Carriage = {
  feeCents: number;
  zone: ZoneLike | null;
  /** Set only when `enforceGates` was on and the order cannot be placed. */
  error: string | null;
};

/**
 * The single carriage-pricing authority: checkout and every admin re-price go
 * through here, so the number the customer was quoted and the number the order
 * carries can never be computed by two different rules.
 *
 * Falls back to the flat `store.shippingCents` when no zone covers the CAP. That
 * is not a nicety — an order placed before zones existed, or one to a CAP whose
 * zone was later retired, still has to re-price without the admin being told the
 * address is unserviceable.
 *
 * `enforceGates` separates the two callers. At checkout an unserviceable CAP or
 * an under-minimum basket must stop the sale. When an operator edits an existing
 * order at the counter they have already agreed to take it, so the gates inform
 * rather than block.
 */
export async function quoteCarriage(opts: {
  fulfilment: "pickup" | "delivery" | "shipping";
  subtotalCents: number;
  cap?: string | null;
  lines?: CarriageLine[];
  freeShippingCoupon?: boolean;
  enforceGates?: boolean;
}): Promise<Carriage> {
  if (opts.fulfilment === "pickup") return { feeCents: 0, zone: null, error: null };

  const zones = await getDeliveryZones();
  const quote = quoteFulfilment({
    mode: opts.fulfilment,
    subtotalCents: opts.subtotalCents,
    zones,
    cap: opts.cap,
    weightKg: billableWeightKg(opts.lines ?? []),
    freeShippingCoupon: opts.freeShippingCoupon,
  });

  if (quote.zone) {
    return { feeCents: quote.feeCents, zone: quote.zone, error: opts.enforceGates ? quote.error : null };
  }
  if (opts.enforceGates && quote.error) return { feeCents: 0, zone: null, error: quote.error };

  // No zone matched and we are not gating: reproduce the pre-zone flat rule so
  // nothing regresses.
  const flat = await getSetting<number>("store.shippingCents", SHIPPING_CENTS);
  const threshold = await getSetting<number>("store.freeShippingThresholdCents", 0);
  const waived =
    !!opts.freeShippingCoupon || (threshold > 0 && opts.subtotalCents >= threshold);
  return { feeCents: waived ? 0 : flat, zone: null, error: null };
}

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
  /** The method actually recorded — re-derived server-side, not the client's. */
  paymentMethod: CustomerPaymentMethod;
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

  // Refuse a *partial* basket as loudly as an empty one.
  //
  // The filter above drops any slug that is missing, deactivated, made
  // non-purchasable or priceless since the cart was filled — and the cart lives
  // in localStorage indefinitely, so that is an ordinary consequence of the shop
  // retiring a product, not an edge case. Only `length === 0` used to throw, so
  // a two-item basket quietly became a one-item order: the customer reached
  // Stripe showing a total they never agreed to, or turned up at the counter for
  // goods that were never on the order. Nothing told them, and nothing told the
  // shop either.
  if (lines.length !== input.items.length) {
    const resolved = new Set(lines.map((l) => l.product.slug));
    const missing = [...new Set(input.items.map((i) => i.slug).filter((s) => !resolved.has(s)))];
    throw new Error(
      missing.length === 1
        ? "Un prodotto nel carrello non è più disponibile. Rimuovilo e riprova."
        : `${missing.length} prodotti nel carrello non sono più disponibili. Rimuovili e riprova.`,
    );
  }

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

  // The master switch. "Se disattivo, il negozio è di sola consultazione" is
  // what Impostazioni promises, and it was true only of the catalogue pages,
  // which hide the grid: nothing here or in `/api/checkout` ever read the
  // setting, so a cart already sitting in localStorage checked out perfectly
  // happily against a shop the owner believed was closed.
  if (!(await getSetting<boolean>("store.enabled", true))) {
    throw new Error("Il negozio online non accetta ordini al momento.");
  }

  // For pickup, the chosen shop must exist and have the store enabled.
  let pickupSlotAt: Date | null = null;
  if (input.fulfilment === "pickup") {
    if (!input.shopSlug) throw new Error("Scegli un negozio per il ritiro");
    const shop = await getShopBySlug(input.shopSlug);
    if (!shop) throw new Error("Negozio di ritiro non valido");
    if (!shop.storeEnabled) throw new Error("Questa sede non offre il ritiro in negozio");

    // Re-derived from the schedule as it stands now, never trusted from the
    // form: the page may have rendered an hour ago, the schedule may have
    // changed since, and the last place in a capped window may already be gone.
    const slots = await getPickupSlots(input.shopSlug);
    const resolved = resolvePickupSlot(slots, input.shopSlug, input.pickupSlot, {
      bookedCounts: await getPickupSlotCounts(Date.now()),
      // The weekly schedule has no idea about the calendar, so without this a
      // window generated from Thursday's hours is bookable on the Thursday of
      // the August shutdown.
      closures: await getClosures(),
    });
    if (!resolved.ok) throw new Error(resolved.error);
    pickupSlotAt = resolved.atMs == null ? null : new Date(resolved.atMs);
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
  // A code the customer typed and saw accepted must not vanish at the till.
  // The preview runs the same rules, but a last use can be taken or a
  // first-order code disqualified between the two; refusing here puts the
  // reason in front of the customer instead of charging full price under a
  // "codice applicato" they were still looking at.
  if (input.discountCode?.trim() && !discount) {
    throw new Error(
      `Il codice sconto ${normalizeCode(input.discountCode)} non è valido o non è più applicabile a questo ordine. Rimuovilo e riprova.`,
    );
  }
  const discountCents = discount?.discountCents ?? 0;

  // Carriage comes from the zone serving the CAP. Gates are enforced here (and
  // only here): an unserviceable postcode or an under-minimum basket must stop
  // the sale rather than quietly price at zero.
  const carriage = await quoteCarriage({
    fulfilment: input.fulfilment,
    subtotalCents,
    cap: input.zip,
    lines: lines.map((l) => ({
      quantity: l.quantity,
      soldByWeight: l.product.soldByWeight,
      unit: l.product.unit,
    })),
    freeShippingCoupon: discount?.freeShipping,
    enforceGates: true,
  });
  if (carriage.error) throw new Error(carriage.error);
  const shippingCents = carriage.feeCents;
  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

  // The payment method is re-checked here against the shop's live settings and
  // the server's own total, never taken on the client's word: the rules depend
  // on the fulfilment mode (you cannot pay at a counter you'll never stand at)
  // and on a total the browser doesn't get to decide (the contrassegno cap).
  // Defaulted here as well as in the zod schema. `createOrder` is a plain
  // function, not an HTTP handler: anything calling it without going through the
  // checkout parser must get the historical behaviour (pay by card) rather than
  // an undefined method that reaches the rules table as a missing key.
  const paymentMethod: CustomerPaymentMethod = input.paymentMethod ?? "card";
  const methodError = paymentMethodError(
    paymentMethod,
    input.fulfilment,
    totalCents,
    await getPaymentAvailability(),
  );
  if (methodError) throw new Error(methodError);

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
            // A delivery round belongs to whichever location drives it, so the
            // daily fulfilment screen can group it under that shop just like a
            // pickup. Courier shipping belongs to no location.
            shopSlug:
              input.fulfilment === "pickup"
                ? input.shopSlug ?? null
                : carriage.zone?.shopSlug ?? null,
            pickupSlotAt,
            deliveryZoneId: carriage.zone?.id ?? null,
            shippingAddress: needsAddress(input.fulfilment)
              ? { address: input.address ?? "", city: input.city ?? "", zip: input.zip ?? "" }
              : null,
            subtotalCents,
            shippingCents,
            discountCode: discount?.code ?? null,
            discountCents,
            totalCents,
            paymentMethod,
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
    paymentMethod,
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

  // Re-validate the coupon against the new subtotal, for the same customer the
  // sale is for (per-customer caps, first-order-only). A code that no longer
  // qualifies is dropped rather than carried over at its old value.
  const discount = order.discountCode
    ? await validateDiscount(order.discountCode, subtotalCents, {
        userId: order.userId,
        email: order.email || undefined,
        shopSlug: order.fulfilment === "pickup" ? order.shopSlug : null,
      })
    : null;
  // The counter's negotiated reduction rides with the coupon, exactly as at
  // creation — and is capped the same way, so an edit that shrinks the basket
  // cannot leave a discount larger than the goods.
  const manualDiscountCents = Math.min(order.manualDiscountCents, subtotalCents);
  const discountCents = Math.min(subtotalCents, (discount?.discountCents ?? 0) + manualDiscountCents);
  const droppedDiscountCode = order.discountCode && !discount ? order.discountCode : undefined;

  // Re-quote carriage from the order's own CAP, with the gates off: the operator
  // editing this order has already agreed to take it, so an under-minimum basket
  // re-prices rather than refusing to save.
  const carriage = await quoteCarriage({
    fulfilment: order.fulfilment,
    subtotalCents,
    cap: order.shippingAddress?.zip,
    lines: items.map((i) => ({
      quantity: i.quantity,
      weightKg: i.weightKg,
      // Line rows carry no catalogue flags; a weighed line already states its
      // weight, and anything else contributes nothing rather than a guess.
      soldByWeight: false,
    })),
    freeShippingCoupon: discount?.freeShipping,
  });
  // An explicit figure typed by the operator wins over the rules, here as at
  // creation — otherwise the first edit silently put the flat rate back. A
  // pickup carries nothing, override or not: an order switched to pickup must
  // not keep paying the courier fee it was typed with.
  const shippingCents =
    order.fulfilment === "pickup" ? carriage.feeCents : order.shippingOverrideCents ?? carriage.feeCents;

  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

  await db
    .update(orders)
    .set({
      subtotalCents,
      discountCents,
      manualDiscountCents,
      discountCode: discount?.code ?? null,
      shippingCents,
      deliveryZoneId: carriage.zone?.id ?? null,
      // A delivery/shipping order belongs to the sede whose zone serves it,
      // exactly as `createOrder` records it. Left alone for a pickup, whose
      // sede is the counter the customer chose.
      ...(order.fulfilment === "pickup" ? {} : { shopSlug: carriage.zone?.shopSlug ?? null }),
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
      pickupSlotAt: orders.pickupSlotAt,
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
 * Take an order's goods out of stock, exactly once, whenever that moment is.
 *
 * A card order applies this at payment. An order to be paid on collection or on
 * delivery applies it the moment it is placed — the ciauscolo has to be set
 * aside for Thursday, and a shop that only decrements at payment would keep
 * selling meat it has already promised. Both paths later run through
 * `finalizeOrder`, so the decrement has to be claimed rather than repeated:
 * `stockAppliedAt` is the claim, flipped null → now in the same statement that
 * wins the right to do the work.
 *
 * Best-effort throughout. Inventory bookkeeping must never be the reason a paid
 * order fails to finalize, so nothing in here throws.
 *
 * Returns true when this call is the one that applied it.
 */
export async function applyOrderStock(orderId: string, reason: string): Promise<boolean> {
  const [claimed] = await db
    .update(orders)
    .set({ stockAppliedAt: new Date() })
    .where(and(eq(orders.id, orderId), sql`${orders.stockAppliedAt} is null`))
    .returning({ id: orders.id });
  if (!claimed) return false;

  try {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

    // Aggregate ordered quantity per product (an order could list a product
    // across more than one line).
    const qtyByProduct = new Map<string, number>();
    for (const it of items) {
      if (!it.productId) continue;
      const units = stockUnitsForLine(it);
      if (units === 0) continue;
      qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + units);
    }
    if (qtyByProduct.size === 0) return true;

    const threshold = await getSetting<number>("store.lowStockThreshold", 5);
    const lowStock: { name: string; stock: number }[] = [];
    const notifyIds: string[] = [];

    for (const [productId, qty] of qtyByProduct) {
      // One atomic read-modify-write that ledgers the delta ACTUALLY applied,
      // so the movement history always sums to the balance even if the order
      // oversold (createOrder guards against that, but a concurrent buyer can
      // still race it).
      const change = await applyStockChange({ productId, delta: -qty, reason });
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
      await db
        .update(products)
        .set({ lowStockNotifiedAt: new Date() })
        .where(inArray(products.id, notifyIds));
    }
  } catch {
    // Swallowed on purpose — stock/alert bookkeeping is best-effort.
  }
  return true;
}

/** The shape both confirmation emails are built from. */
async function orderEmailData(order: typeof orders.$inferSelect): Promise<OrderEmailData> {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const shop = order.shopSlug ? await getShopBySlug(order.shopSlug) : null;
  return {
    orderNumber: order.orderNumber,
    name: order.name,
    email: order.email,
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, lineTotalCents: i.lineTotalCents })),
    totalCents: order.totalCents,
    fulfilment: order.fulfilment,
    shopName: shop?.name ?? null,
    pickupSlotLabel: order.pickupSlotAt ? formatSlotLabel(order.pickupSlotAt) : null,
  };
}

/**
 * Accept an order that will be paid when the goods change hands (in bottega or
 * alla consegna). Nothing has been charged, so this is NOT `finalizeOrder`:
 *
 *  - stock IS reserved, because the order is a firm commitment the shop has to
 *    honour, unlike a card checkout the customer may simply abandon;
 *  - the customer is emailed a confirmation that states plainly what is still
 *    owed and how to settle it, rather than "grazie del pagamento";
 *  - loyalty and the coupon count are NOT touched. Both belong to money that has
 *    actually arrived, and both happen at `finalizeOrder` when the operator
 *    registers the payment.
 *
 * Idempotent: the stock claim is atomic, and the mail is keyed off winning it,
 * so a double submit cannot double-reserve or double-email.
 */
export async function registerOfflineOrder(orderId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;

  const first = await applyOrderStock(orderId, `Ordine ${order.orderNumber} (da incassare)`);
  if (!first) return;

  const data = await orderEmailData(order);
  await Promise.allSettled([
    sendMail({
      to: order.email,
      ...orderAwaitingPaymentEmail(data, order.paymentMethod === "on_delivery" ? "on_delivery" : "in_store"),
    }),
    sendMail({ to: env.ownerEmail, ...orderOwnerEmail(data, { toCollectCents: order.totalCents }) }),
  ]);
}

/**
 * Idempotently finalize a paid order: mark paid, email customer + owner, award
 * loyalty points. Safe to call more than once (webhook + success page).
 *
 * `paidWith` records the instrument the money arrived on. It is what the
 * electronic invoice's ModalitaPagamento is derived from, so an operator
 * settling an order at the counter must pass what actually happened (contanti
 * vs POS) rather than letting it default.
 */
export async function finalizeOrder(
  orderId: string,
  opts: { paymentIntentId?: string | null; paidWith?: PaymentInstrument | null } = {},
): Promise<void> {
  // Atomically claim the order: flip unpaid → paid only if it isn't already paid.
  // Only the caller whose UPDATE actually changed a row proceeds to award points
  // and email, so concurrent webhook + success-page calls can't double-accrue.
  const now = new Date();
  const [claimed] = await db
    .update(orders)
    .set({
      // An order already handed over (goods first, money after — the normal
      // rhythm in bottega) stays "evaso"; flipping it back to "pagato" put it
      // back in the to-fulfil queue the moment the money came in.
      status: sql`case when ${orders.status} = 'fulfilled' then 'fulfilled' else 'paid' end`,
      paymentStatus: "paid",
      paidAt: now,
      updatedAt: now,
      // Recorded here because this is the first point at which a PaymentIntent
      // exists; refund events later arrive keyed on it.
      ...(opts.paymentIntentId ? { stripePaymentIntentId: opts.paymentIntentId } : {}),
      // A Stripe payment is a card by definition. Anything else has to say so.
      ...(opts.paidWith ? { paidWith: opts.paidWith } : opts.paymentIntentId ? { paidWith: "card" as const } : {}),
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

  const emailData = await orderEmailData(order);

  // An order paid on handover was already confirmed when it was placed, and its
  // owner notification already fired. Re-sending both at settlement would tell
  // the customer their order has been received a second time, hours after they
  // walked out with it. The receipt for that payment is the fiscal document.
  if (!settlesOnHandover(order.paymentMethod)) {
    await Promise.allSettled([
      sendMail({ to: order.email, ...orderCustomerEmail(emailData) }),
      sendMail({ to: env.ownerEmail, ...orderOwnerEmail(emailData) }),
    ]);
  }

  // Loyalty accrual for logged-in customers, when the programme is enabled.
  const loyaltyEnabled = await getSetting<boolean>("loyalty.enabled", true);
  if (loyaltyEnabled && order.userId) {
    const perEuro = await getSetting<number>("loyalty.pointsPerEuro", 1);
    const points = Math.floor((order.subtotalCents / 100) * (perEuro || 1));
    if (points > 0) await addPoints(order.userId, points, `Ordine ${order.orderNumber}`);
  }

  // The goods leave stock exactly once, whichever moment that was: an order
  // paid on handover already reserved them when it was placed, and this call
  // finds the claim taken and does nothing.
  await applyOrderStock(orderId, `Ordine ${order.orderNumber}`);
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
 * Abandon a card checkout that was never completed — the Stripe session expired,
 * or the abandoned-order sweep found it still pending long after it was placed.
 *
 * Nothing was charged and (for a card order) nothing was reserved, so this just
 * clears the row out of the work queue instead of leaving a "pending" order the
 * operator has to reason about forever.
 *
 * Restricted to `card` on purpose. An order to be paid in bottega or alla
 * consegna is *supposed* to sit unpaid until the customer turns up; sweeping one
 * away because nobody had paid yet would cancel a perfectly good order the shop
 * has already set the goods aside for. Those are cancelled by a human, through
 * the admin, which is also what puts the goods back.
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
        eq(orders.paymentMethod, "card"),
      ),
    )
    .returning({ id: orders.id })
;
  if (!claimed) return false;
  // Belt and braces: a card order should never hold a stock claim, but if one
  // somehow does, abandoning it has to give the goods back.
  await restockOrderItems(orderId, "Checkout abbandonato");
  return true;
}

/**
 * Return an order's goods to stock (used when a refunded or cancelled order's
 * goods come back). Increments each stock-tracked product atomically and writes
 * a compensating `stock_movements` row so the ledger reconciles.
 *
 * Idempotent, and the mirror image of `applyOrderStock`: it releases the same
 * `stockAppliedAt` claim, so it can only ever give back goods that were actually
 * taken out, and only once. That guard is what lets callers stop reasoning about
 * whether a given order ever reached the decrement — an unpaid card checkout
 * never did, an unpaid "pago al ritiro" order did, and both now cancel safely
 * through the same call.
 *
 * Best-effort: inventory bookkeeping must never block the refund/cancel itself.
 */
export async function restockOrderItems(
  orderId: string,
  reason: string,
  byUserId?: string | null,
): Promise<void> {
  const [claimed] = await db
    .update(orders)
    .set({ stockAppliedAt: null })
    .where(and(eq(orders.id, orderId), sql`${orders.stockAppliedAt} is not null`))
    .returning({ id: orders.id });
  if (!claimed) return;

  try {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const qtyByProduct = new Map<string, number>();
    for (const it of items) {
      if (!it.productId) continue;
      const units = stockUnitsForLine(it);
      if (units === 0) continue;
      qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + units);
    }
    for (const [productId, qty] of qtyByProduct) {
      const change = await applyStockChange({ productId, delta: qty, reason, byUserId });
      if (change) await restoreBatches(productId, change.applied);
    }
  } catch {
    // Best-effort — a refund must not fail because inventory bookkeeping did.
  }
}
