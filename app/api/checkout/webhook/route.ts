import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getStripe } from "@/lib/payments/stripe";
import { finalizeOrder, expireOrder, recordRefund } from "@/lib/orders";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail/mailer";
import { paymentIssueOwnerEmail } from "@/lib/mail/templates";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** The id of whatever Stripe handed us, whether expanded or a bare string. */
function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * Resolve the order a refund belongs to.
 *
 * Orders finalized since the PaymentIntent column exists resolve with one
 * indexed lookup. Older ones predate it, so fall back to asking Stripe which
 * Checkout Session owns the intent and match on the session id we did store.
 */
async function orderIdForPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<string | null> {
  const [byIntent] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  if (byIntent) return byIntent.id;

  try {
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });
    const sessionId = sessions.data[0]?.id;
    if (!sessionId) return null;
    const [bySession] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.stripeSessionId, sessionId))
      .limit(1);
    return bySession?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * The actor recorded for anything Stripe does on its own. `audit_log.actor_id`
 * is a plain nullable column with no foreign key precisely so non-human actors
 * can appear in the trail.
 */
const STRIPE_ACTOR = { id: "system:stripe", name: "Stripe" } as const;

/** Alert the shop, and leave a trail, when an order's money goes wrong. */
async function reportPaymentIssue(
  orderId: string,
  kind: "failed" | "disputed",
  detail: string | null,
  amountCents?: number | null,
): Promise<void> {
  const [order] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) return;

  await logAudit({
    actor: STRIPE_ACTOR,
    action: kind === "disputed" ? "order.payment_disputed" : "order.payment_failed",
    entity: "order",
    entityId: order.id,
    summary:
      kind === "disputed"
        ? `Contestazione aperta sull'ordine ${order.orderNumber}`
        : `Pagamento non riuscito per l'ordine ${order.orderNumber}`,
    meta: { detail, amountCents },
  });

  await sendMail({
    to: env.ownerEmail,
    ...paymentIssueOwnerEmail({
      orderNumber: order.orderNumber,
      orderId: order.id,
      kind,
      amountCents,
      detail,
    }),
  });
}

/**
 * Stripe webhook.
 *
 * Covers the whole money lifecycle, not just the happy path:
 *  - `checkout.session.completed` / `async_payment_succeeded` → finalize (stock,
 *    loyalty, coupon, emails). The session is trusted only when `payment_status`
 *    says it actually paid: with delayed payment methods a *completed* session
 *    can still be unpaid, and finalizing one would ship goods for free.
 *  - `checkout.session.expired` → release the abandoned order so it stops
 *    sitting in the work queue.
 *  - `checkout.session.async_payment_failed` → the delayed payment (SEPA, bank
 *    redirect) that the *completed* session was waiting on has bounced. Nothing
 *    was collected, so the order is released and the shop is told — otherwise it
 *    sits pending forever and someone eventually packs it.
 *  - `charge.refunded` → mirror a refund issued from the Stripe dashboard back
 *    into the order (restock + free the coupon once it is refunded in full).
 *  - `charge.dispute.created` → a chargeback, which has a response deadline and
 *    appears nowhere the shop looks during a normal day. Alert, don't reverse:
 *    disputing is the owner's decision and the money has not moved yet.
 *
 * Every handler is idempotent, so Stripe redeliveries are safe. The success page
 * also finalizes as a fallback, so orders are never stuck if webhooks aren't set up.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe || !env.stripe.webhookSecret) {
    return NextResponse.json({ ok: false, error: "Webhook non configurato" }, { status: 400 });
  }

  const sig = request.headers.get("stripe-signature");
  const raw = await request.text();
  if (!sig) return NextResponse.json({ ok: false }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, env.stripe.webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Firma non valida" },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (orderId && session.payment_status === "paid") {
          await finalizeOrder(orderId, { paymentIntentId: idOf(session.payment_intent) });
        }
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (orderId) await expireOrder(orderId);
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (!orderId) break;
        // `expireOrder` only touches an order still pending and unpaid, so a
        // redelivery — or a failure that arrives after the customer retried and
        // succeeded — changes nothing.
        const released = await expireOrder(orderId);
        if (released) {
          await reportPaymentIssue(
            orderId,
            "failed",
            "Il pagamento differito è stato rifiutato. L'ordine è stato annullato automaticamente.",
            session.amount_total,
          );
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId = idOf(dispute.payment_intent);
        if (!paymentIntentId) break;
        const orderId = await orderIdForPaymentIntent(stripe, paymentIntentId);
        if (orderId) {
          await reportPaymentIssue(
            orderId,
            "disputed",
            `Motivo dichiarato: ${dispute.reason}. Rispondi dalla dashboard Stripe entro la scadenza indicata.`,
            dispute.amount,
          );
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = idOf(charge.payment_intent);
        if (!paymentIntentId) break;
        const orderId = await orderIdForPaymentIntent(stripe, paymentIntentId);
        // `amount_refunded` is cumulative, which is exactly what recordRefund
        // expects — so this converges whether the refund started here or in the
        // admin, and a redelivered event changes nothing.
        if (orderId) {
          await recordRefund(orderId, charge.amount_refunded, { reason: "Rimborso (Stripe)" });
        }
        break;
      }
    }
  } catch (err) {
    // A 5xx makes Stripe retry, which is what we want for a transient failure.
    console.error(`[webhook] handler failed for ${event.type}:`, err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
