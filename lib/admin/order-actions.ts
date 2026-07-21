"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { requireAdmin, requireRole } from "@/lib/auth/session";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm, orderStatusInput } from "@/lib/validation/admin";
import { getShopBySlug } from "@/lib/db/queries";
import { orderStatusEmail } from "@/lib/mail/templates";
import { sendMail } from "@/lib/mail/mailer";
import { getStripe } from "@/lib/payments/stripe";

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

export async function updateOrderStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
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
    await requireRole("admin");
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

    revalidatePath(`/admin/orders/${id}`);
    revalidatePath("/admin/orders");
    return ok("Rimborso emesso.");
  });
}
