"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems, products, users, reservations, type ReservationRow } from "@/lib/db/schema";
import { requireAdmin, requireRole } from "@/lib/auth/session";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import {
  parseForm,
  orderStatusInput,
  orderSettleInput,
  manualOrderInput,
  orderDetailsInput,
  orderFiscalInput,
} from "@/lib/validation/admin";
import {
  getShopBySlug,
  getSetting,
  getPickupSlots,
  getPickupSlotCounts,
  getClosures,
} from "@/lib/db/queries";
import { orderStatusEmail, orderCustomerEmail, orderAwaitingPaymentEmail } from "@/lib/mail/templates";
import { sendMail } from "@/lib/mail/mailer";
import { getStripe } from "@/lib/payments/stripe";
import {
  generateOrderNumber,
  finalizeOrder,
  restockOrderItems,
  recalcOrderTotals,
  recordRefund,
  quoteCarriage,
} from "@/lib/orders";
import { needsAddress, FULFILMENT_LABEL } from "@/lib/fulfilment";
import { PAYMENT_INSTRUMENT_LABEL, settlesOnHandover } from "@/lib/payments/methods";
import { resolvePickupSlot, formatSlotLabel } from "@/lib/pickup-slots";
import { applyStockChange, consumeBatchesFefo } from "@/lib/stock";
import { validateDiscount, recordDiscountUse, releaseDiscountUseByCode } from "@/lib/discounts";
import { addPoints } from "@/lib/loyalty";
import { logAudit } from "@/lib/audit";
import { requireShopScope } from "@/lib/admin/scope";
import { trackingUrlFor } from "@/lib/carriers";

type OrderRow = typeof orders.$inferSelect;

/**
 * Notify the customer of an order status change (fulfilled / cancelled /
 * refunded). Best-effort: any failure is logged but never bubbles up so the
 * status update itself always succeeds.
 */
async function notifyOrderStatus(
  order: OrderRow,
  status: "fulfilled" | "cancelled" | "refunded",
  /** Refund detail, so a partial refund quotes the amount actually returned
   *  rather than the order total. */
  refund?: { refundAmountCents: number; partialRefund: boolean },
): Promise<void> {
  try {
    const shopName =
      order.fulfilment !== "shipping" && order.shopSlug
        ? (await getShopBySlug(order.shopSlug))?.name ?? null
        : null;
    const built = orderStatusEmail(
      {
        orderNumber: order.orderNumber,
        name: order.name,
        fulfilment: order.fulfilment,
        shopName,
        pickupSlotLabel: order.pickupSlotAt ? formatSlotLabel(order.pickupSlotAt) : null,
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
        // Resolved here rather than in the template: the URL comes from a
        // setting, and templates stay pure string-builders with no DB reads.
        trackingUrl: await trackingUrlFor(order.carrier, order.trackingNumber),
        totalCents: order.totalCents,
        refundAmountCents: refund?.refundAmountCents ?? null,
        partialRefund: refund?.partialRefund ?? false,
      },
      status,
    );
    await sendMail({ to: order.email, subject: built.subject, html: built.html, text: built.text });
  } catch (err) {
    console.error(`[order-actions] status email failed (${status}) for ${order.orderNumber}:`, err);
  }
}

/**
 * Load an order, or refuse with a sentence — and refuse just as firmly when it
 * belongs to another location.
 *
 * Every mutating action here goes through this. A shop-scoped list is not access
 * control on its own: the order id travels in a form field, so without the check
 * at the write a Carni operator could still refund a Centro order by posting one.
 */
async function mustFindOrder(id: string): Promise<OrderRow> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) throw new ActionError("Ordine non trovato.");
  await requireShopScope(order.shopSlug);
  return order;
}

type ProductRow = typeof products.$inferSelect;

export type ManualLine = {
  product: ProductRow;
  /** Units. Always 1 for a weight line, so sums over quantity stay meaningful. */
  quantity: number;
  /** Kilos, for a product priced per kg. */
  weightKg: number | null;
  /** Per unit, or per kg for a weight line. */
  unitPriceCents: number;
  lineTotalCents: number;
  priceOverridden: boolean;
};

/**
 * Read the line fields of a counter-sale form into priced lines.
 *
 * Three field families, all keyed by product slug:
 *   `qty_<slug>`   — units, for anything sold by the piece
 *   `kg_<slug>`    — kilos, for a product priced per kg. The till could only
 *                    take whole units before, so a norcineria — whose whole
 *                    catalogue is priced per kg — could not ring up its actual
 *                    sales.
 *   `price_<slug>` — a negotiated unit price in euros, overriding the catalogue
 *
 * Prices still come from the database unless explicitly overridden, and the
 * override is flagged on the line so it doesn't later read as a stale snapshot.
 */
async function readManualLines(fd: FormData): Promise<ManualLine[]> {
  const qtyBySlug = new Map<string, number>();
  const kgBySlug = new Map<string, number>();
  const priceBySlug = new Map<string, number>();

  for (const [k, raw] of fd.entries()) {
    const v = String(raw).trim();
    if (v === "") continue;
    const num = Number(v.replace(",", "."));
    if (!Number.isFinite(num)) continue;

    if (k.startsWith("qty_")) {
      if (Number.isInteger(num) && num > 0) qtyBySlug.set(k.slice(4), num);
    } else if (k.startsWith("kg_")) {
      if (num > 0) kgBySlug.set(k.slice(3), num);
    } else if (k.startsWith("price_")) {
      if (num >= 0) priceBySlug.set(k.slice(6), Math.round(num * 100));
    }
  }

  const slugs = [...new Set([...qtyBySlug.keys(), ...kgBySlug.keys()])];
  if (slugs.length === 0) return [];

  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.active, true), inArray(products.slug, slugs)));

  const lines: ManualLine[] = [];
  for (const p of rows) {
    const override = priceBySlug.get(p.slug);
    const unitPriceCents = override ?? p.priceCents;
    if (unitPriceCents == null) continue; // no catalogue price and none given

    const kg = kgBySlug.get(p.slug);
    if (kg != null) {
      // Round to grams before pricing so the total is reproducible from the
      // stored weight (a till prints 0,347 kg, not 0,3472891).
      const weightKg = Math.round(kg * 1000) / 1000;
      lines.push({
        product: p,
        quantity: 1,
        weightKg,
        unitPriceCents,
        lineTotalCents: Math.round(unitPriceCents * weightKg),
        priceOverridden: override != null && override !== p.priceCents,
      });
      continue;
    }

    const quantity = qtyBySlug.get(p.slug);
    if (!quantity) continue;
    lines.push({
      product: p,
      quantity,
      weightKg: null,
      unitPriceCents,
      lineTotalCents: unitPriceCents * quantity,
      priceOverridden: override != null && override !== p.priceCents,
    });
  }
  return lines;
}

/** The order_items rows for a set of manual lines. */
const lineValues = (orderId: string, lines: ManualLine[]) =>
  lines.map((l) => ({
    orderId,
    productId: l.product.id,
    productSlug: l.product.slug,
    name: l.product.name,
    unitPriceCents: l.unitPriceCents,
    quantity: l.quantity,
    weightKg: l.weightKg,
    priceOverridden: l.priceOverridden,
    lineTotalCents: l.lineTotalCents,
    vatRateBps: l.product.vatRateBps,
  }));

/**
 * Stock to remove for a line.
 *
 * A product priced per kg has no meaningful unit count, and `products.stock` is
 * an integer, so a 0,35 kg sale can't be represented as a decrement. Rather than
 * invent a number, weight lines don't move stock automatically — the operator
 * adjusts the whole form's remaining weight by hand. Returns 0 for those.
 */
const stockUnitsFor = (l: ManualLine) => (l.weightKg != null ? 0 : l.quantity);

/**
 * Create an order by hand from the back-office (counter / phone sale). Prices,
 * VAT rates and stock all come from the DB — the form supplies quantities (or
 * kilos), and optionally a negotiated price. When "markPaid" is set the order is
 * booked as paid (provider "manual") and stock is decremented; no emails are sent
 * (this is a staff-entered sale, not an online checkout).
 */
export async function createManualOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(manualOrderInput, fd);

    const lines = await readManualLines(fd);
    if (lines.length === 0) {
      throw new ActionError("Aggiungi almeno un prodotto con una quantità o un peso.");
    }

    let pickupSlotAt: Date | null = null;
    if (d.fulfilment === "pickup" && d.shopSlug) {
      const shop = await getShopBySlug(d.shopSlug);
      if (!shop) throw new ActionError("Negozio di ritiro non valido.");
      // A counter sale is rung up for the counter you are standing at.
      await requireShopScope(d.shopSlug);
      // A counter operator may leave the window blank even where slots exist —
      // the customer is standing there. Only a window that was chosen is checked.
      if (d.pickupSlot) {
        const resolved = resolvePickupSlot(await getPickupSlots(d.shopSlug), d.shopSlug, d.pickupSlot, {
          closures: await getClosures(),
          bookedCounts: await getPickupSlotCounts(Date.now()),
        });
        if (!resolved.ok) throw new ActionError(resolved.error);
        pickupSlotAt = resolved.atMs == null ? null : new Date(resolved.atMs);
      }
    }
    if (needsAddress(d.fulfilment) && (!d.address || !d.city || !d.zip)) {
      throw new ActionError(
        d.fulfilment === "delivery"
          ? "Per la consegna a domicilio servono indirizzo, città e CAP."
          : "Per la spedizione servono indirizzo, città e CAP.",
      );
    }

    // Link a known customer by email so the sale shows in their history and (when
    // paid) accrues loyalty, exactly like an online order. Resolved before the
    // coupon check, which needs to know who is using the code (per-customer cap,
    // first-order-only).
    const linkedUser = d.email
      ? (
          await db
            .select({ id: users.id })
            .from(users)
            .where(eq(sql`lower(${users.email})`, d.email))
            .limit(1)
        )[0] ?? null
      : null;

    const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const coupon = await validateDiscount(d.discountCode, subtotalCents, {
      userId: linkedUser?.id,
      email: d.email,
      shopSlug: d.fulfilment === "pickup" ? d.shopSlug : null,
    });
    // A negotiated counter reduction rides in the same field as a coupon, so it
    // is apportioned across VAT rates by the existing allocation instead of
    // needing a parallel path that could get the tax wrong.
    const manualDiscount = Math.min(d.manualDiscountEuros ?? 0, subtotalCents);
    const discountCents = Math.min(subtotalCents, (coupon?.discountCents ?? 0) + manualDiscount);

    // Gates off: the operator taking this order at the counter has already
    // agreed to it, so an out-of-area CAP prices from the fallback instead of
    // refusing a sale that is physically happening.
    const carriage = await quoteCarriage({
      fulfilment: d.fulfilment,
      subtotalCents,
      cap: d.zip,
      lines: lines.map((l) => ({
        quantity: l.quantity,
        weightKg: l.weightKg,
        soldByWeight: l.product.soldByWeight,
        unit: l.product.unit,
      })),
      freeShippingCoupon: coupon?.freeShipping,
    });
    // An explicit figure wins — a phone order to the next street isn't the flat rate.
    const shippingCents = d.shippingEuros ?? carriage.feeCents;
    const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);
    const paid = d.markPaid;
    const discount = coupon;

    // A booking being rung up. Validated before the insert so a stale tab cannot
    // convert the same one twice — the unique index on `orders.reservation_id`
    // would refuse it anyway, but with a constraint name instead of a sentence.
    let booking: ReservationRow | null = null;
    if (d.reservationId) {
      const [res] = await db
        .select()
        .from(reservations)
        .where(eq(reservations.id, d.reservationId))
        .limit(1);
      if (!res) throw new ActionError("Prenotazione non trovata.");
      await requireShopScope(res.shopSlug);
      if (res.type !== "order") {
        throw new ActionError("Solo un ordine speciale si converte in ordine.");
      }
      const [already] = await db
        .select({ orderNumber: orders.orderNumber })
        .from(orders)
        .where(eq(orders.reservationId, res.id))
        .limit(1);
      if (already) {
        throw new ActionError(`Questa prenotazione è già diventata l'ordine ${already.orderNumber}.`);
      }
      booking = res;
    }

    const orderNumber = generateOrderNumber();
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(orders)
        .values({
          orderNumber,
          userId: linkedUser?.id ?? null,
          email: d.email ?? "",
          name: d.name,
          phone: d.phone ?? null,
          status: paid ? "paid" : "pending",
          fulfilment: d.fulfilment,
          shopSlug:
            d.fulfilment === "pickup" ? d.shopSlug ?? null : carriage.zone?.shopSlug ?? null,
          pickupSlotAt,
          deliveryZoneId: carriage.zone?.id ?? null,
          shippingAddress: needsAddress(d.fulfilment)
            ? { address: d.address ?? "", city: d.city ?? "", zip: d.zip ?? "" }
            : null,
          subtotalCents,
          shippingCents,
          discountCode: discount?.code ?? null,
          discountCents,
          totalCents,
          paymentProvider: "manual",
          paymentMethod: "counter",
          paymentStatus: paid ? "paid" : "unpaid",
          // Contanti or POS, as the operator rang it up — this is what puts the
          // right ModalitaPagamento on the receipt/invoice.
          paidWith: paid ? d.paidWith : null,
          // A counter sale settles the moment it's rung up.
          paidAt: paid ? new Date() : null,
          // The goods left the shelf with the customer; the ledger entry below
          // is the movement, and this stamp is what stops a later cancellation
          // from putting back stock that was never returned.
          stockAppliedAt: paid ? new Date() : null,
          notes: d.notes ?? null,
          reservationId: booking?.id ?? null,
        })
        .returning({ id: orders.id })
;
      await tx.insert(orderItems).values(lineValues(row.id, lines));
      // Closed in the same transaction as the order it became: a booking marked
      // done beside an order that failed to insert is the worse of the two
      // possible half-states, because nothing is left to say the sale is owed.
      if (booking) {
        await tx
          .update(reservations)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(reservations.id, booking.id));
      }
      return row;
    });

    // Count the coupon only when the sale is actually paid (an unpaid draft that
    // is later marked paid gets counted then, via finalizeOrder).
    if (discount && paid) {
      await recordDiscountUse(discount.id, {
        orderId: created.id,
        userId: linkedUser?.id,
        email: d.email,
        amountCents: discount.discountCents,
      });
    }

    // A paid counter sale immediately reduces stock (atomic, never below zero) for
    // products that track it, and is written to the movement ledger so counter
    // sales are reconcilable alongside online orders and manual adjustments.
    if (paid) {
      for (const l of lines) {
        const units = stockUnitsFor(l);
        if (units === 0) continue;
        const change = await applyStockChange({
          productId: l.product.id,
          delta: -units,
          reason: `Vendita al banco ${orderNumber}`,
          byUserId: actor.id,
        });
        if (change) await consumeBatchesFefo(l.product.id, -change.applied);
      }
    }

    // Accrue loyalty for a paid sale to a known customer (mirrors finalizeOrder,
    // but silent — no confirmation email for an in-person counter sale).
    if (paid && linkedUser) {
      const loyaltyEnabled = await getSetting<boolean>("loyalty.enabled", true);
      if (loyaltyEnabled) {
        const perEuro = await getSetting<number>("loyalty.pointsPerEuro", 1);
        const points = Math.floor((subtotalCents / 100) * (perEuro || 1));
        if (points > 0) await addPoints(linkedUser.id, points, `Vendita al banco ${orderNumber}`, actor.id);
      }
    }

    await logAudit({
      actor,
      action: "order.manual_create",
      entity: "order",
      entityId: created.id,
      summary: `Ordine manuale ${orderNumber} (${paid ? "pagato" : "da pagare"}) — ${(totalCents / 100).toFixed(2)} €`,
      meta: { paid, totalCents },
    });

    revalidatePath("/admin/orders");
    return ok(`Ordine ${orderNumber} creato${paid ? " e segnato come pagato" : ""}.`);
  });
}

/**
 * True once an order's money is settled. Lines and totals are frozen from this
 * point: the customer has been charged a specific amount, and silently rewriting
 * the order would desynchronise the books from the payment. Corrections to a
 * settled order go through refund (or refund-and-rebook).
 */
function isSettled(order: OrderRow): boolean {
  return order.paymentStatus !== "unpaid" || order.status === "refunded";
}

/** Guard used by both editing actions. */
function assertEditable(order: OrderRow): void {
  if (isSettled(order)) {
    throw new ActionError(
      "Questo ordine è già pagato: articoli e importi non si modificano. Usa «Rimborsa» e registra un nuovo ordine.",
    );
  }
  if (order.status === "cancelled") {
    throw new ActionError("Questo ordine è annullato. Riportalo in attesa per modificarlo.");
  }
}

/**
 * Edit an order's contact and delivery details. Allowed on any order that isn't
 * settled. Switching between pickup and shipping changes the shipping fee, so
 * the totals are recomputed afterwards.
 */
export async function updateOrderDetails(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(orderDetailsInput, fd);

    const order = await mustFindOrder(d.id);
    assertEditable(order);

    let pickupSlotAt: Date | null = null;
    if (d.fulfilment === "pickup") {
      if (!d.shopSlug) throw new ActionError("Scegli il negozio di ritiro.");
      if (!(await getShopBySlug(d.shopSlug))) throw new ActionError("Negozio di ritiro non valido.");
      if (d.pickupSlot) {
        const resolved = resolvePickupSlot(await getPickupSlots(d.shopSlug), d.shopSlug, d.pickupSlot, {
          closures: await getClosures(),
          bookedCounts: await getPickupSlotCounts(Date.now()),
        });
        if (!resolved.ok) throw new ActionError(resolved.error);
        pickupSlotAt = resolved.atMs == null ? null : new Date(resolved.atMs);
      } else if (order.fulfilment === "pickup" && order.shopSlug === d.shopSlug) {
        // Same shop, no new window posted: keep the appointment the customer
        // already has rather than silently clearing it on an unrelated edit.
        pickupSlotAt = order.pickupSlotAt;
      }
    } else if (!d.address || !d.city || !d.zip) {
      throw new ActionError(
        d.fulfilment === "delivery"
          ? "Per la consegna a domicilio servono indirizzo, città e CAP."
          : "Per la spedizione servono indirizzo, città e CAP.",
      );
    }

    await db
      .update(orders)
      .set({
        name: d.name,
        email: d.email ?? "",
        phone: d.phone ?? null,
        fulfilment: d.fulfilment,
        // Left to `recalcOrderTotals` below, which re-matches the zone from the
        // (possibly just-changed) CAP — setting it here would use the old one.
        shopSlug: d.fulfilment === "pickup" ? d.shopSlug ?? null : null,
        pickupSlotAt,
        shippingAddress: needsAddress(d.fulfilment)
          ? { address: d.address ?? "", city: d.city ?? "", zip: d.zip ?? "" }
          : null,
        notes: d.notes ?? null,
        internalNotes: d.internalNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, d.id));

    // The carriage fee follows the method and the CAP, so re-price.
    const recalc = await recalcOrderTotals(d.id);

    await logAudit({
      actor,
      action: "order.details",
      entity: "order",
      entityId: order.id,
      summary: `Ordine ${order.orderNumber}: anagrafica aggiornata${
        d.fulfilment !== order.fulfilment
          ? ` (${FULFILMENT_LABEL[order.fulfilment]} → ${FULFILMENT_LABEL[d.fulfilment]})`
          : ""
      }`,
      meta: { fulfilment: d.fulfilment, totalCents: recalc.totalCents },
    });

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${d.id}`);
    return ok(
      recalc.droppedDiscountCode
        ? `Ordine aggiornato. Il codice ${recalc.droppedDiscountCode} non è più applicabile ed è stato rimosso.`
        : "Ordine aggiornato.",
    );
  });
}

/**
 * Record the buyer's fiscal identity for the electronic invoice.
 *
 * Unlike the rest of the order, this stays editable after payment: a customer
 * usually asks for an invoice *after* paying, and their codice fiscale or P.IVA
 * has to be enterable at that point. It changes no amounts, so allowing it on a
 * settled order can't desynchronise anything — only a refunded order is closed
 * to further invoicing changes.
 */
export async function setOrderFiscalIdentity(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(orderFiscalInput, fd);

    const order = await mustFindOrder(d.id);
    if (order.status === "refunded") {
      throw new ActionError("Ordine rimborsato: i dati di fatturazione non sono più modificabili.");
    }

    // An SdI recipient code is exactly 7 characters when supplied.
    const sdi = (d.customerSdiCode ?? "").replace(/[^A-Za-z0-9]/g, "");
    if (sdi && sdi.length !== 7) {
      throw new ActionError("Il codice destinatario SdI deve avere 7 caratteri.");
    }

    await db
      .update(orders)
      .set({
        customerTaxCode: d.customerTaxCode ?? null,
        customerVatNumber: d.customerVatNumber ?? null,
        customerSdiCode: sdi || null,
        customerPec: d.customerPec ?? null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, d.id));

    await logAudit({
      actor,
      action: "order.fiscal",
      entity: "order",
      entityId: order.id,
      summary: `Dati di fatturazione aggiornati per ${order.orderNumber}`,
      meta: {
        taxCode: d.customerTaxCode ?? null,
        vatNumber: d.customerVatNumber ?? null,
        sdiCode: sdi || null,
      },
    });

    revalidatePath(`/admin/orders/${d.id}`);
    return ok("Dati di fatturazione salvati.");
  });
}

/**
 * Rewrite an order's line items: change quantities, drop a line (quantity 0) or
 * add a product. Quantities arrive as `qty_<productSlug>` fields, matching the
 * manual-order form.
 *
 * Only for orders that aren't settled. Because stock is decremented at *payment*
 * (see `finalizeOrder`), an unpaid order holds no stock, so there is nothing to
 * reconcile here — but the available quantity is still checked so the edit can't
 * create an order that could never be fulfilled.
 */
export async function updateOrderItems(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Ordine non valido.");

    const order = await mustFindOrder(id);
    assertEditable(order);

    const lines = await readManualLines(fd);
    if (lines.length === 0) {
      throw new ActionError("Un ordine deve contenere almeno un articolo. Per svuotarlo, annullalo.");
    }

    // Same oversell guard as checkout: an unpaid order holds no stock, so this
    // compares against the full on-hand quantity. Weight lines are exempt —
    // their stock isn't counted in units (see `stockUnitsFor`).
    const shortages = lines.filter(
      (l) => stockUnitsFor(l) > 0 && l.product.stock != null && l.product.stock < l.quantity,
    );
    if (shortages.length > 0) {
      throw new ActionError(
        `Scorte insufficienti per: ${shortages
          .map((l) => `${l.product.name} (disponibili: ${l.product.stock})`)
          .join(", ")}`,
      );
    }

    // Replace the lines wholesale — simpler and safer than diffing, and the
    // order is unpaid so no downstream record depends on the old rows.
    await db.transaction(async (tx) => {
      await tx.delete(orderItems).where(eq(orderItems.orderId, id));
      await tx.insert(orderItems).values(lineValues(id, lines));
    });

    const recalc = await recalcOrderTotals(id);

    await logAudit({
      actor,
      action: "order.items",
      entity: "order",
      entityId: order.id,
      summary: `Ordine ${order.orderNumber}: articoli aggiornati (${lines.length} righe) — totale ${(
        recalc.totalCents / 100
      ).toFixed(2)} €`,
      meta: {
        totalCents: recalc.totalCents,
        lines: lines.map((l) => ({ slug: l.product.slug, quantity: l.quantity })),
      },
    });

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${id}`);
    return ok(
      recalc.droppedDiscountCode
        ? `Articoli aggiornati. Il codice ${recalc.droppedDiscountCode} non è più applicabile ed è stato rimosso.`
        : `Articoli aggiornati. Nuovo totale ${(recalc.totalCents / 100).toFixed(2)} €.`,
    );
  });
}

export async function updateOrderStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(orderStatusInput, fd);
    const order = await mustFindOrder(d.id);

    // Refunds move money AND inventory — they must go through the admin-only
    // "Rimborsa" button (real Stripe refund + restock + customer email), never a
    // silent dropdown flip that would email a refund confirmation with no refund.
    if (d.status === "refunded" || d.paymentStatus === "refunded") {
      throw new ActionError(
        'Per rimborsare usa il pulsante "Rimborsa": restituisce il pagamento, ripristina la giacenza e avvisa il cliente.',
      );
    }

    // Marking an unpaid order paid runs the full paid-order flow (stock decrement
    // + ledger, loyalty accrual, confirmation email) instead of a bare flip — and
    // it has to record HOW the money arrived, because that becomes the invoice's
    // ModalitaPagamento. A dropdown cannot know whether it was contanti or POS,
    // so, exactly as with refunds, it sends the operator to the form that asks.
    if ((d.status === "paid" || d.paymentStatus === "paid") && order.paymentStatus !== "paid") {
      throw new ActionError(
        'Per segnare un ordine come pagato usa "Registra incasso": serve sapere se il pagamento è avvenuto in contanti o con il POS, perché finisce sulla fattura.',
      );
    }

    const cur = order;

    // Cancelling returns whatever the order was actually holding. The call is
    // unconditional because `restockOrderItems` releases the order's own stock
    // claim and no-ops when there isn't one — which is the only way to get this
    // right now that reservation and payment are separate moments: an abandoned
    // card checkout never took stock, while an unpaid "pago al ritiro" order did,
    // and both arrive here as `paymentStatus: "unpaid"`.
    if (d.status === "cancelled" && cur.status !== "cancelled") {
      await restockOrderItems(order.id, `Annullo ordine ${order.orderNumber}`, actor.id);
      // The coupon is only ever counted at payment, so only a paid order has one
      // to give back.
      if (cur.paymentStatus === "paid" && order.discountCode) {
        await releaseDiscountUseByCode(order.discountCode, order.id);
      }
    }

    const statusChanged = d.status !== cur.status;
    const paymentChanged = d.paymentStatus != null && d.paymentStatus !== cur.paymentStatus;
    if (statusChanged || paymentChanged) {
      await db
        .update(orders)
        .set({
          ...(statusChanged ? { status: d.status } : {}),
          ...(paymentChanged ? { paymentStatus: d.paymentStatus } : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, d.id));
    }

    // Email on fulfilled/cancelled transitions. The paid confirmation is already
    // sent by finalizeOrder; refunds are blocked above.
    if ((d.status === "fulfilled" || d.status === "cancelled") && d.status !== order.status) {
      await notifyOrderStatus({ ...cur, status: d.status }, d.status);
    }

    if (d.status !== order.status) {
      await logAudit({
        actor,
        action: "order.status",
        entity: "order",
        entityId: order.id,
        summary: `Ordine ${order.orderNumber}: stato ${order.status} → ${d.status}`,
        meta: { from: order.status, to: d.status, paymentStatus: d.paymentStatus },
      });
    }

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${d.id}`);
    return ok("Ordine aggiornato.");
  });
}

/**
 * Apply one status to a batch of selected orders.
 *
 * Deliberately narrow: only the transitions that are safe to do in bulk without
 * a per-order decision. Refunds are excluded (they move money and need the
 * dedicated button), and so is "paid" — marking an order paid runs the full
 * finalize flow (stock, loyalty, confirmation email), which should be a
 * considered, one-at-a-time act.
 *
 * Each order goes through the same `updateOrderStatus` path as a single edit, so
 * emails, restocking and the audit trail behave identically; failures are
 * collected and reported rather than aborting the whole batch.
 */
export async function bulkUpdateOrderStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const ids = fd.getAll("ids").map(String).filter(Boolean);
    const status = String(fd.get("status") ?? "");
    if (ids.length === 0) throw new ActionError("Seleziona almeno un ordine.");
    if (!BULK_ORDER_STATUSES.includes(status as (typeof BULK_ORDER_STATUSES)[number])) {
      throw new ActionError("Questa operazione non è disponibile in blocco.");
    }

    let changed = 0;
    const failures: string[] = [];
    for (const id of ids) {
      const single = new FormData();
      single.set("id", id);
      single.set("status", status);
      const res = await updateOrderStatus({ status: "idle" }, single);
      if (res.status === "error") failures.push(res.message ?? id);
      else changed += 1;
    }

    revalidatePath("/admin/orders");
    if (failures.length > 0) {
      return ok(
        `${changed} ordini aggiornati, ${failures.length} non modificati (${failures[0]}${
          failures.length > 1 ? " …" : ""
        }).`,
      );
    }
    return ok(`${changed} ordini aggiornati.`);
  });
}

/** The subset of order statuses that may be applied to a whole selection. */
const BULK_ORDER_STATUSES = ["fulfilled", "cancelled", "pending"] as const;

/**
 * Save carrier + tracking number on a shipping order. If the order is already
 * fulfilled and shipping, (re)send the "in viaggio" email with the tracking.
 */
export async function setOrderTracking(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Ordine non valido.");
    const carrier = String(fd.get("carrier") ?? "").trim() || null;
    const trackingNumber = String(fd.get("trackingNumber") ?? "").trim() || null;

    const order = await mustFindOrder(id);
    const changed = order.carrier !== carrier || order.trackingNumber !== trackingNumber;

    await db
      .update(orders)
      .set({ carrier, trackingNumber, updatedAt: new Date() })
      .where(eq(orders.id, id));

    const emailed = order.status === "fulfilled" && order.fulfilment === "shipping";
    if (emailed) {
      await notifyOrderStatus({ ...order, carrier, trackingNumber }, "fulfilled");
    }

    // This writes shipping data and can re-send a customer email, and was the
    // one order action that left no trace — so "why did the customer get a
    // second dispatch notice?" had no answer in the log.
    if (changed || emailed) {
      await logAudit({
        actor,
        action: "order.tracking",
        entity: "order",
        entityId: order.id,
        summary: `Ordine ${order.orderNumber}: tracking ${
          trackingNumber ? `${carrier ?? "corriere"} ${trackingNumber}` : "rimosso"
        }${emailed ? " — email di spedizione inviata" : ""}`,
        meta: {
          carrier,
          trackingNumber,
          previousCarrier: order.carrier,
          previousTrackingNumber: order.trackingNumber,
          emailed,
        },
      });
    }

    revalidatePath(`/admin/orders/${id}`);
    revalidatePath("/admin/orders");
    return ok(
      order.status === "fulfilled" && order.fulfilment === "shipping"
        ? "Tracking salvato ed email inviata."
        : "Tracking salvato.",
    );
  });
}

/**
 * Re-send the customer's copy of an order email.
 *
 * Emails go missing — a typo'd address later corrected, a spam folder, a
 * customer who deleted it. Before this the only way to get one back out was to
 * bounce the order's status, which sent the *wrong* message and wrote a bogus
 * audit line. Which email is re-sent follows the order's current state.
 */
export async function resendOrderEmail(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Ordine non valido.");

    const order = await mustFindOrder(id);
    if (!order.email) throw new ActionError("Questo ordine non ha un indirizzo email.");

    let what: string;
    if (order.status === "fulfilled" || order.status === "cancelled") {
      await notifyOrderStatus(order, order.status);
      what = order.status === "fulfilled" ? "avviso di evasione" : "avviso di annullamento";
    } else if (order.paymentStatus === "paid" || settlesOnHandover(order.paymentMethod)) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const shop = order.shopSlug ? await getShopBySlug(order.shopSlug) : null;
      const data = {
        orderNumber: order.orderNumber,
        name: order.name,
        email: order.email,
        items: items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          lineTotalCents: i.lineTotalCents,
        })),
        totalCents: order.totalCents,
        fulfilment: order.fulfilment,
        shopName: shop?.name ?? null,
        pickupSlotLabel: order.pickupSlotAt ? formatSlotLabel(order.pickupSlotAt) : null,
      };
      // An order still awaiting payment gets the email it actually received —
      // the one that states what is owed. Re-sending "ordine confermato" would
      // tell someone who has paid nothing that their payment went through.
      const awaiting = order.paymentStatus === "unpaid";
      await sendMail({
        to: order.email,
        ...(awaiting
          ? orderAwaitingPaymentEmail(
              data,
              order.paymentMethod === "on_delivery" ? "on_delivery" : "in_store",
            )
          : orderCustomerEmail(data)),
      }).catch(() => {});
      what = awaiting ? "ricevuta d'ordine" : "conferma d'ordine";
    } else {
      throw new ActionError(
        "L'ordine non è ancora pagato: non c'è nessuna conferma da reinviare.",
      );
    }

    await logAudit({
      actor,
      action: "order.resend_email",
      entity: "order",
      entityId: order.id,
      summary: `Reinviata la ${what} per l'ordine ${order.orderNumber} a ${order.email}`,
      meta: { to: order.email, kind: what },
    });

    revalidatePath("/admin/outbox");
    return ok(`Email reinviata a ${order.email}.`);
  });
}

/**
 * Register a payment taken outside Stripe: the customer paid at the counter when
 * they collected, or handed the money to whoever drove the round.
 *
 * This is the closing half of the "paga alla consegna" cycle. It runs the same
 * `finalizeOrder` as a card payment — so loyalty accrues, the coupon is counted
 * and the fiscal date is stamped exactly as it would be online — with two
 * differences that matter:
 *
 *  - the instrument is recorded, because contanti is MP01 and POS is MP08 and
 *    the invoice cannot guess;
 *  - the goods are already out of stock (reserved when the order was placed), so
 *    `applyOrderStock` finds its claim taken and correctly does nothing.
 *
 * Available to staff, not just admins: taking money at the counter is the job.
 */
export async function settleOrderPayment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(orderSettleInput, fd);
    const order = await mustFindOrder(d.id);

    if (order.paymentStatus === "paid") throw new ActionError("Questo ordine risulta già pagato.");
    if (order.paymentStatus === "refunded") {
      throw new ActionError("Questo ordine è stato rimborsato: non può essere incassato.");
    }
    if (order.status === "cancelled") {
      throw new ActionError("Questo ordine è annullato. Riportalo in attesa prima di incassarlo.");
    }

    await finalizeOrder(order.id, { paidWith: d.paidWith });

    await logAudit({
      actor,
      action: "order.settle",
      entity: "order",
      entityId: order.id,
      summary: `Incasso registrato per l'ordine ${order.orderNumber}: ${(order.totalCents / 100).toFixed(2)} € (${PAYMENT_INSTRUMENT_LABEL[d.paidWith]})`,
      meta: { paidWith: d.paidWith, totalCents: order.totalCents, paymentMethod: order.paymentMethod },
    });

    revalidatePath(`/admin/orders/${d.id}`);
    revalidatePath("/admin/orders");
    revalidatePath("/admin/fulfilment");
    return ok(
      `Incasso di ${(order.totalCents / 100).toFixed(2)} € registrato (${PAYMENT_INSTRUMENT_LABEL[d.paidWith]}).`,
    );
  });
}

/**
 * Issue a refund, in full or in part (admin-only — this moves money).
 *
 * `importoEuros` is optional: leave it empty to refund everything still
 * outstanding. A smaller amount is passed through to Stripe as a partial refund
 * and accumulated on `orders.refundedCents`; the order only becomes `refunded`
 * once the whole total has been given back. Goods are returned to stock and the
 * coupon is freed on that final transition only — a partial refund is a price
 * adjustment, not a return (see `recordRefund`).
 *
 * When Stripe is live the payment is really refunded via the API; in simulate
 * mode (no Stripe / no session) only local state moves.
 */
export async function refundOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Ordine non valido.");

    const order = await mustFindOrder(id);
    if (order.status === "refunded" || order.paymentStatus === "refunded") {
      throw new ActionError("Questo ordine è già stato rimborsato.");
    }

    const remainingCents = order.totalCents - order.refundedCents;
    if (remainingCents <= 0) throw new ActionError("Non c'è più nulla da rimborsare su questo ordine.");

    // Same "euros in, cents stored" convention as the rest of the admin forms.
    const raw = String(fd.get("importoEuros") ?? "").trim().replace(",", ".");
    let amountCents = remainingCents;
    if (raw !== "") {
      const parsed = Math.round(Number(raw) * 100);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new ActionError("Importo del rimborso non valido.");
      }
      if (parsed > remainingCents) {
        throw new ActionError(
          `L'importo supera il residuo rimborsabile (${(remainingCents / 100).toFixed(2)} €).`,
        );
      }
      amountCents = parsed;
    }
    const isPartial = amountCents < remainingCents;

    const stripe = getStripe();
    const useStripe = Boolean(stripe && (order.stripePaymentIntentId || order.stripeSessionId));
    if (stripe && useStripe) {
      try {
        // Orders finalized since the PaymentIntent is stored skip the round-trip;
        // older ones still resolve it from the checkout session.
        let paymentIntent = order.stripePaymentIntentId ?? null;
        if (!paymentIntent && order.stripeSessionId) {
          const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
          paymentIntent =
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
        }
        if (!paymentIntent) {
          throw new ActionError("Pagamento Stripe non trovato per questo ordine.");
        }
        await stripe.refunds.create({ payment_intent: paymentIntent, amount: amountCents });
      } catch (err) {
        if (err instanceof ActionError) throw err;
        console.error(`[order-actions] Stripe refund failed for ${order.orderNumber}:`, err);
        throw new ActionError("Il rimborso Stripe non è andato a buon fine. Riprova o controlla la dashboard Stripe.");
      }
    }

    // Cumulative by design: if the `charge.refunded` webhook for this same
    // refund lands first, this converges instead of double-counting.
    const outcome = await recordRefund(order.id, order.refundedCents + amountCents, {
      reason: `Rimborso ordine ${order.orderNumber}`,
      actorId: actor.id,
    });
    if (!outcome || outcome.deltaCents === 0) {
      // Stripe already moved the money; the local state was updated by the
      // webhook. Report success rather than inviting the operator to retry.
      revalidatePath(`/admin/orders/${id}`);
      return ok("Rimborso già registrato su questo ordine.");
    }

    await notifyOrderStatus(
      outcome.full
        ? { ...order, status: "refunded", paymentStatus: "refunded" }
        : order,
      "refunded",
      { refundAmountCents: amountCents, partialRefund: isPartial },
    );

    await logAudit({
      actor,
      action: isPartial ? "order.refund_partial" : "order.refund",
      entity: "order",
      entityId: order.id,
      summary: `Rimborso${isPartial ? " parziale" : ""} di ${(amountCents / 100).toFixed(2)} € per l'ordine ${order.orderNumber}`,
      meta: {
        amountCents,
        refundedTotalCents: outcome.refundedCents,
        totalCents: order.totalCents,
        stripe: useStripe,
      },
    });

    revalidatePath(`/admin/orders/${id}`);
    revalidatePath("/admin/orders");
    return ok(
      isPartial
        ? `Rimborso parziale di ${(amountCents / 100).toFixed(2)} € emesso. Residuo: ${((order.totalCents - outcome.refundedCents) / 100).toFixed(2)} €.`
        : "Rimborso emesso.",
    );
  });
}
