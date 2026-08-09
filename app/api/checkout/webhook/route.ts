import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getStripe } from "@/lib/payments/stripe";
import { finalizeOrder, expireOrder, recordRefund } from "@/lib/orders";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
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
 * Stripe webhook.
 *
 * Covers the whole money lifecycle, not just the happy path:
 *  - `checkout.session.completed` / `async_payment_succeeded` → finalize (stock,
 *    loyalty, coupon, emails). The session is trusted only when `payment_status`
 *    says it actually paid: with delayed payment methods a *completed* session
 *    can still be unpaid, and finalizing one would ship goods for free.
 *  - `checkout.session.expired` → release the abandoned order so it stops
 *    sitting in the work queue.
 *  - `charge.refunded` → mirror a refund issued from the Stripe dashboard back
 *    into the order (restock + free the coupon once it is refunded in full).
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
