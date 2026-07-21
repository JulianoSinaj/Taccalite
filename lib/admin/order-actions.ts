"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems, products } from "@/lib/db/schema";
import { requireAdmin, requireRole } from "@/lib/auth/session";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm, orderStatusInput, manualOrderInput } from "@/lib/validation/admin";
import { getShopBySlug, getSetting } from "@/lib/db/queries";
import { orderStatusEmail } from "@/lib/mail/templates";
import { sendMail } from "@/lib/mail/mailer";
import { getStripe } from "@/lib/payments/stripe";
import { generateOrderNumber } from "@/lib/orders";
import { validateDiscount, recordDiscountUse } from "@/lib/discounts";
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

    const orderNumber = generateOrderNumber();
    const created = db.transaction((tx) => {
      const [row] = tx
        .insert(orders)
        .values({
          orderNumber,
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

    if (discount) await recordDiscountUse(discount.id);

    // A paid counter sale immediately reduces stock (atomic, never below zero) for
    // products that track it.
    if (paid) {
      for (const l of lines) {
        db.update(products)
          .set({ stock: sql`max(0, ${products.stock} - ${l.quantity})` })
          .where(and(eq(products.id, l.product.id), isNotNull(products.stock)))
          .run();
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

export async function updateOrderStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(orderStatusInput, fd);
    const [order] = await db.select().from(orders).where(eq(orders.id, d.id)).limit(1);
    if (!order) throw new ActionError("Ordine non trovato.");

    await db
      .update(orders)
      .set({
        status: d.status,
        // Payment status is editable alongside fulfilment status when provided.
        ...(d.paymentStatus ? { paymentStatus: d.paymentStatus } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, d.id));

    // Email the customer only on the meaningful terminal transitions, and only
    // when the status actually changed. Never on paid/pending.
    if (
      (d.status === "fulfilled" || d.status === "cancelled" || d.status === "refunded") &&
      d.status !== order.status
    ) {
      await notifyOrderStatus({ ...order, status: d.status }, d.status);
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
 * Issue a refund (admin-only — this moves money). When Stripe is live and the
 * order carries a checkout session, the payment is actually refunded via the
 * Stripe API; in simulate mode (no Stripe / no session) we only update state.
 * Either way the order becomes refunded and the customer is emailed.
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

    const stripe = getStripe();
    if (stripe && order.stripeSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
        const paymentIntent =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;
        if (!paymentIntent) {
          throw new ActionError("Pagamento Stripe non trovato per questo ordine.");
        }
        await stripe.refunds.create({ payment_intent: paymentIntent });
      } catch (err) {
        if (err instanceof ActionError) throw err;
        console.error(`[order-actions] Stripe refund failed for ${order.orderNumber}:`, err);
        throw new ActionError("Il rimborso Stripe non è andato a buon fine. Riprova o controlla la dashboard Stripe.");
      }
    }

    await db
      .update(orders)
      .set({ status: "refunded", paymentStatus: "refunded", updatedAt: new Date() })
      .where(eq(orders.id, id));

    await notifyOrderStatus({ ...order, status: "refunded", paymentStatus: "refunded" }, "refunded");

    await logAudit({
      actor,
      action: "order.refund",
      entity: "order",
      entityId: order.id,
      summary: `Rimborso di ${(order.totalCents / 100).toFixed(2)} € per l'ordine ${order.orderNumber}`,
      meta: { totalCents: order.totalCents, stripe: Boolean(stripe && order.stripeSessionId) },
    });

    revalidatePath(`/admin/orders/${id}`);
    revalidatePath("/admin/orders");
    return ok("Rimborso emesso.");
  });
}
