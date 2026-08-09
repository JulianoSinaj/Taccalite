"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems, products, stockMovements, users } from "@/lib/db/schema";
import { requireAdmin, requireRole } from "@/lib/auth/session";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import {
  parseForm,
  orderStatusInput,
  manualOrderInput,
  orderDetailsInput,
  orderFiscalInput,
} from "@/lib/validation/admin";
import { getShopBySlug, getSetting } from "@/lib/db/queries";
import { orderStatusEmail } from "@/lib/mail/templates";
import { sendMail } from "@/lib/mail/mailer";
import { getStripe } from "@/lib/payments/stripe";
import {
  generateOrderNumber,
  finalizeOrder,
  restockOrderItems,
  recalcOrderTotals,
  recordRefund,
} from "@/lib/orders";
import { validateDiscount, recordDiscountUse, releaseDiscountUseByCode } from "@/lib/discounts";
import { addPoints } from "@/lib/loyalty";
import { logAudit } from "@/lib/audit";

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
      order.fulfilment === "pickup" && order.shopSlug
        ? (await getShopBySlug(order.shopSlug))?.name ?? null
        : null;
    const built = orderStatusEmail(
      {
        orderNumber: order.orderNumber,
        name: order.name,
        fulfilment: order.fulfilment,
        shopName,
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
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
 * Create an order by hand from the back-office (counter / phone sale). Prices,
 * VAT rates and stock all come from the DB — the form only supplies quantities.
 * Quantities arrive as `qty_<slug>` fields. When "markPaid" is set the order is
 * booked as paid (provider "manual") and stock is decremented; no emails are sent
 * (this is a staff-entered sale, not an online checkout).
 */
export async function createManualOrder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(manualOrderInput, fd);

    // Collect qty_<slug> → quantity for positive quantities.
    const wanted = new Map<string, number>();
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("qty_")) continue;
      const qty = Number(v);
      if (Number.isInteger(qty) && qty > 0) wanted.set(k.slice(4), qty);
    }
    if (wanted.size === 0) throw new ActionError("Aggiungi almeno un prodotto con quantità.");

    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.active, true), inArray(products.slug, [...wanted.keys()])));
    const lines = rows
      .filter((p) => p.priceCents != null)
      .map((p) => {
        const quantity = wanted.get(p.slug)!;
        return {
          product: p,
          quantity,
          unitPriceCents: p.priceCents!,
          lineTotalCents: p.priceCents! * quantity,
        };
      });
    if (lines.length === 0) throw new ActionError("Nessun prodotto valido con prezzo selezionato.");

    if (d.fulfilment === "pickup" && d.shopSlug) {
      const shop = await getShopBySlug(d.shopSlug);
      if (!shop) throw new ActionError("Negozio di ritiro non valido.");
    }
    if (d.fulfilment === "shipping" && (!d.address || !d.city || !d.zip)) {
      throw new ActionError("Per la spedizione servono indirizzo, città e CAP.");
    }

    const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const discount = await validateDiscount(d.discountCode, subtotalCents);
    const discountCents = discount?.discountCents ?? 0;

    const flatShippingCents = await getSetting<number>("store.shippingCents", 700);
    const freeThreshold = await getSetting<number>("store.freeShippingThresholdCents", 0);
    const shippingCents =
      d.fulfilment === "shipping" &&
      !discount?.freeShipping &&
      (freeThreshold === 0 || subtotalCents < freeThreshold)
        ? flatShippingCents
        : 0;
    const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);
    const paid = d.markPaid;

    // Link a known customer by email so the sale shows in their history and (when
    // paid) accrues loyalty, exactly like an online order.
    const linkedUser = d.email
      ? (
          await db
            .select({ id: users.id })
            .from(users)
            .where(eq(sql`lower(${users.email})`, d.email))
            .limit(1)
        )[0] ?? null
      : null;

    const orderNumber = generateOrderNumber();
    const created = db.transaction((tx) => {
      const [row] = tx
        .insert(orders)
        .values({
          orderNumber,
          userId: linkedUser?.id ?? null,
          email: d.email ?? "",
          name: d.name,
          phone: d.phone ?? null,
          status: paid ? "paid" : "pending",
          fulfilment: d.fulfilment,
          shopSlug: d.fulfilment === "pickup" ? d.shopSlug ?? null : null,
          shippingAddress:
            d.fulfilment === "shipping"
              ? { address: d.address ?? "", city: d.city ?? "", zip: d.zip ?? "" }
              : null,
          subtotalCents,
          shippingCents,
          discountCode: discount?.code ?? null,
          discountCents,
          totalCents,
          paymentProvider: "manual",
          paymentStatus: paid ? "paid" : "unpaid",
          // A counter sale settles the moment it's rung up.
          paidAt: paid ? new Date() : null,
          notes: d.notes ?? null,
        })
        .returning({ id: orders.id })
        .all();
      tx.insert(orderItems)
        .values(
          lines.map((l) => ({
            orderId: row.id,
            productId: l.product.id,
            productSlug: l.product.slug,
            name: l.product.name,
            unitPriceCents: l.unitPriceCents,
            quantity: l.quantity,
            lineTotalCents: l.lineTotalCents,
            vatRateBps: l.product.vatRateBps,
          })),
        )
        .run();
      return row;
    });

    // Count the coupon only when the sale is actually paid (an unpaid draft that
    // is later marked paid gets counted then, via finalizeOrder).
    if (discount && paid) await recordDiscountUse(discount.id);

    // A paid counter sale immediately reduces stock (atomic, never below zero) for
    // products that track it, and is written to the movement ledger so counter
    // sales are reconcilable alongside online orders and manual adjustments.
    if (paid) {
      for (const l of lines) {
        const [u] = db
          .update(products)
          .set({ stock: sql`max(0, ${products.stock} - ${l.quantity})` })
          .where(and(eq(products.id, l.product.id), isNotNull(products.stock)))
          .returning({ stock: products.stock })
          .all();
        if (u?.stock != null) {
          db.insert(stockMovements)
            .values({
              productId: l.product.id,
              delta: -l.quantity,
              reason: `Vendita al banco ${orderNumber}`,
              stockAfter: u.stock,
              createdByUserId: actor.id,
            })
            .run();
        }
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

    const [order] = await db.select().from(orders).where(eq(orders.id, d.id)).limit(1);
    if (!order) throw new ActionError("Ordine non trovato.");
    assertEditable(order);

    if (d.fulfilment === "pickup") {
      if (!d.shopSlug) throw new ActionError("Scegli il negozio di ritiro.");
      if (!(await getShopBySlug(d.shopSlug))) throw new ActionError("Negozio di ritiro non valido.");
    } else if (!d.address || !d.city || !d.zip) {
      throw new ActionError("Per la spedizione servono indirizzo, città e CAP.");
    }

    await db
      .update(orders)
      .set({
        name: d.name,
        email: d.email ?? "",
        phone: d.phone ?? null,
        fulfilment: d.fulfilment,
        shopSlug: d.fulfilment === "pickup" ? d.shopSlug ?? null : null,
        shippingAddress:
          d.fulfilment === "shipping"
            ? { address: d.address ?? "", city: d.city ?? "", zip: d.zip ?? "" }
            : null,
        notes: d.notes ?? null,
        internalNotes: d.internalNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, d.id));

    // The shipping fee follows the fulfilment method, so re-price.
    const recalc = await recalcOrderTotals(d.id);

    await logAudit({
      actor,
      action: "order.details",
      entity: "order",
      entityId: order.id,
      summary: `Ordine ${order.orderNumber}: anagrafica aggiornata${
        d.fulfilment !== order.fulfilment ? ` (${order.fulfilment} → ${d.fulfilment})` : ""
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

    const [order] = await db.select().from(orders).where(eq(orders.id, d.id)).limit(1);
    if (!order) throw new ActionError("Ordine non trovato.");
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

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) throw new ActionError("Ordine non trovato.");
    assertEditable(order);

    // Collect qty_<slug> → quantity, keeping zeros so a line can be removed.
    const wanted = new Map<string, number>();
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("qty_")) continue;
      const qty = Number(v);
      if (!Number.isInteger(qty) || qty < 0) throw new ActionError("Quantità non valida.");
      if (qty > 0) wanted.set(k.slice(4), qty);
    }
    if (wanted.size === 0) {
      throw new ActionError("Un ordine deve contenere almeno un articolo. Per svuotarlo, annullalo.");
    }

    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.active, true), inArray(products.slug, [...wanted.keys()])));

    const lines = rows
      .filter((p) => p.priceCents != null)
      .map((p) => {
        const quantity = wanted.get(p.slug)!;
        return { product: p, quantity, lineTotalCents: p.priceCents! * quantity };
      });
    if (lines.length === 0) throw new ActionError("Nessun prodotto valido con prezzo selezionato.");

    // Same oversell guard as checkout: an unpaid order holds no stock, so this
    // compares against the full on-hand quantity.
    const shortages = lines.filter((l) => l.product.stock != null && l.product.stock < l.quantity);
    if (shortages.length > 0) {
      throw new ActionError(
        `Scorte insufficienti per: ${shortages
          .map((l) => `${l.product.name} (disponibili: ${l.product.stock})`)
          .join(", ")}`,
      );
    }

    // Replace the lines wholesale — simpler and safer than diffing, and the
    // order is unpaid so no downstream record depends on the old rows.
    db.transaction((tx) => {
      tx.delete(orderItems).where(eq(orderItems.orderId, id)).run();
      tx.insert(orderItems)
        .values(
          lines.map((l) => ({
            orderId: id,
            productId: l.product.id,
            productSlug: l.product.slug,
            name: l.product.name,
            unitPriceCents: l.product.priceCents!,
            quantity: l.quantity,
            lineTotalCents: l.lineTotalCents,
            vatRateBps: l.product.vatRateBps,
          })),
        )
        .run();
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
    const [order] = await db.select().from(orders).where(eq(orders.id, d.id)).limit(1);
    if (!order) throw new ActionError("Ordine non trovato.");

    // Refunds move money AND inventory — they must go through the admin-only
    // "Rimborsa" button (real Stripe refund + restock + customer email), never a
    // silent dropdown flip that would email a refund confirmation with no refund.
    if (d.status === "refunded" || d.paymentStatus === "refunded") {
      throw new ActionError(
        'Per rimborsare usa il pulsante "Rimborsa": restituisce il pagamento, ripristina la giacenza e avvisa il cliente.',
      );
    }

    // Marking an unpaid order paid runs the full paid-order flow (stock decrement
    // + ledger, loyalty accrual, confirmation email) instead of a bare flip.
    const wantsPaid =
      (d.status === "paid" || d.paymentStatus === "paid") && order.paymentStatus !== "paid";
    if (wantsPaid) await finalizeOrder(order.id);

    // Re-read after any finalize so comparisons use the current row.
    const [fresh] = await db.select().from(orders).where(eq(orders.id, d.id)).limit(1);
    const cur = fresh ?? order;

    // Cancelling a paid order returns its goods to stock and frees its coupon
    // (mirror of finalize).
    if (d.status === "cancelled" && cur.status !== "cancelled" && cur.paymentStatus === "paid") {
      await restockOrderItems(order.id, `Annullo ordine ${order.orderNumber}`, actor.id);
      if (order.discountCode) await releaseDiscountUseByCode(order.discountCode);
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

    if (d.status !== order.status || wantsPaid) {
      await logAudit({
        actor,
        action: "order.status",
        entity: "order",
        entityId: order.id,
        summary: `Ordine ${order.orderNumber}: stato ${order.status} → ${d.status}${wantsPaid ? " (pagato)" : ""}`,
        meta: { from: order.status, to: d.status, paymentStatus: d.paymentStatus, finalized: wantsPaid },
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
    await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Ordine non valido.");
    const carrier = String(fd.get("carrier") ?? "").trim() || null;
    const trackingNumber = String(fd.get("trackingNumber") ?? "").trim() || null;

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) throw new ActionError("Ordine non trovato.");

    await db
      .update(orders)
      .set({ carrier, trackingNumber, updatedAt: new Date() })
      .where(eq(orders.id, id));

    if (order.status === "fulfilled" && order.fulfilment === "shipping") {
      await notifyOrderStatus({ ...order, carrier, trackingNumber }, "fulfilled");
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

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) throw new ActionError("Ordine non trovato.");
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
