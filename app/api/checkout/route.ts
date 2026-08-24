import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { checkoutSchema } from "@/lib/validation/order";
import { createOrder, finalizeOrder, registerOfflineOrder } from "@/lib/orders";
import { db } from "@/lib/db/client";
import { orders, orderItems } from "@/lib/db/schema";
import { getStripe } from "@/lib/payments/stripe";
import { simulatedPayments } from "@/lib/payments/config";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { absoluteUrl } from "@/lib/site";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

/** A Stripe Checkout Session is worth abandoning after half an hour. */
const SESSION_TTL_SECONDS = 30 * 60;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }

  const limited = rateLimit(`checkout:${clientIp(request)}`, { limit: 10, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Troppe richieste. Riprova tra poco." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: first?.message ?? "Dati non validi" }, { status: 400 });
  }
  if (parsed.data.company) return NextResponse.json({ ok: true, url: "/" }); // honeypot

  const user = await getCurrentUser();

  let created;
  try {
    // Authoritative for the payment method too: `createOrder` re-checks it
    // against the shop's live settings and its own total, so a client that posts
    // "contrassegno" on a courier shipment is refused here, not humoured.
    created = await createOrder(parsed.data, user?.id);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Errore nell'ordine" },
      { status: 400 },
    );
  }

  // ── Paid when the goods change hands ───────────────────────────────────────
  // No payment provider is involved at all: the order is registered as unpaid,
  // the goods are reserved and the customer is told what to bring.
  if (created.paymentMethod !== "card") {
    await registerOfflineOrder(created.orderId);
    return NextResponse.json({
      ok: true,
      // The order id is an unguessable nanoid — it entitles this browser to view
      // the order details on the success page (see getOrderForViewer).
      url: `/checkout/success?order=${created.orderNumber}&token=${created.orderId}`,
    });
  }

  const stripe = getStripe();

  // No Stripe keys. In development this simulates a successful payment so the
  // whole lifecycle stays testable offline. Anywhere else it is a configuration
  // failure, and the order must NOT be finalized: marking it paid would hand
  // over goods for a payment that never existed. The order stays pending, so the
  // shop can still see it and ring the customer.
  if (!stripe) {
    if (!simulatedPayments) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Il pagamento con carta non è al momento disponibile. Scegli il pagamento in bottega o riprova più tardi.",
        },
        { status: 503 },
      );
    }
    await finalizeOrder(created.orderId, { paidWith: "card" });
    return NextResponse.json({
      ok: true,
      simulated: true,
      url: `/checkout/success?order=${created.orderNumber}&token=${created.orderId}&sim=1`,
    });
  }

  // Real Stripe Checkout.
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, created.orderId));
  const [order] = await db.select().from(orders).where(eq(orders.id, created.orderId)).limit(1);

  const lineItems: import("stripe").Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((i) => ({
    quantity: i.quantity,
    price_data: {
      currency: "eur",
      product_data: { name: i.name },
      unit_amount: i.unitPriceCents,
    },
  }));
  if (order.shippingCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: "eur", product_data: { name: "Spedizione" }, unit_amount: order.shippingCents },
    });
  }

  // Reflect any applied coupon as a Stripe discount so the charged total matches
  // the order total (Stripe forbids negative line items). The coupon object has
  // to exist before the session can reference it, so it is cleaned up by hand if
  // the session then fails — otherwise every failed discounted checkout would
  // leave an orphan behind in the Stripe account.
  let couponId: string | null = null;
  try {
    if (order.discountCents > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: order.discountCents,
        currency: "eur",
        duration: "once",
        name: order.discountCode ?? "Sconto",
      });
      couponId = coupon.id;
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: lineItems,
        ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
        customer_email: parsed.data.email,
        // The customer is Italian and so is every other word they have read to
        // get here; Stripe's own default would guess from their browser.
        locale: "it",
        metadata: { orderId: created.orderId, orderNumber: created.orderNumber },
        // Makes the Stripe dashboard readable without cross-referencing ids,
        // and puts the order number on the customer's card statement.
        payment_intent_data: {
          description: `Ordine ${created.orderNumber} — Norcineria Taccalite`,
          metadata: { orderId: created.orderId, orderNumber: created.orderNumber },
        },
        // Without an expiry the session lives 24 h and the `expired` webhook that
        // releases the order arrives a day late. Stripe's minimum is 30 minutes.
        expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
        success_url: absoluteUrl(
          `/checkout/success?order=${created.orderNumber}&session={CHECKOUT_SESSION_ID}`,
        ),
        cancel_url: absoluteUrl("/checkout?annullato=1"),
      },
      // Keyed on the order, which is created fresh per submit: a retried request
      // (a flaky network, a double click that got past the button's disabled
      // state) reuses the same session instead of opening a second one against
      // the same order.
      { idempotencyKey: `checkout:${created.orderId}` },
    );

    await db.update(orders).set({ stripeSessionId: session.id }).where(eq(orders.id, created.orderId));

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    if (couponId) {
      // Best-effort: an orphan coupon is untidy, not dangerous, and must not
      // mask the real error.
      await stripe.coupons.del(couponId).catch(() => {});
    }
    console.error(`[checkout] Stripe session failed for ${created.orderNumber}:`, err);
    return NextResponse.json(
      { ok: false, error: "Non è stato possibile avviare il pagamento. Riprova tra poco." },
      { status: 502 },
    );
  }
}
