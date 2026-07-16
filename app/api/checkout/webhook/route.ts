import { NextResponse } from "next/server";
import { getStripe } from "@/lib/payments/stripe";
import { finalizeOrder } from "@/lib/orders";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Stripe webhook — marks orders paid on checkout.session.completed.
 * Idempotent (finalizeOrder is a no-op if already paid). The success page also
 * finalizes as a fallback, so orders are never stuck if webhooks aren't set up.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe || !env.stripe.webhookSecret) {
    return NextResponse.json({ ok: false, error: "Webhook non configurato" }, { status: 400 });
  }

  const sig = request.headers.get("stripe-signature");
  const raw = await request.text();
  if (!sig) return NextResponse.json({ ok: false }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, env.stripe.webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Firma non valida" },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { metadata?: { orderId?: string } };
    const orderId = session.metadata?.orderId;
    if (orderId) await finalizeOrder(orderId);
  }

  return NextResponse.json({ received: true });
}
