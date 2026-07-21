import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { checkoutSchema } from "@/lib/validation/order";
import { createOrder, finalizeOrder } from "@/lib/orders";
import { db } from "@/lib/db/client";
import { orders, orderItems } from "@/lib/db/schema";
import { getStripe } from "@/lib/payments/stripe";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { absoluteUrl } from "@/lib/site";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

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
    created = await createOrder(parsed.data, user?.id);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Errore nell'ordine" },
      { status: 400 },
    );
  }

  const stripe = getStripe();

  // No Stripe keys → simulate a successful payment (fully testable offline).
  if (!stripe) {
    await finalizeOrder(created.orderId);
    return NextResponse.json({
      ok: true,
      simulated: true,
      // The order id is an unguessable nanoid — it entitles this browser to view
      // the order details on the success page (see getOrderForViewer).
      url: `/checkout/success?order=${created.orderNumber}&token=${created.orderId}&sim=1`,
    });
  }

  // Real Stripe Checkout (test mode).
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

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: parsed.data.email,
    metadata: { orderId: created.orderId },
    success_url: absoluteUrl(
      `/checkout/success?order=${created.orderNumber}&session={CHECKOUT_SESSION_ID}`,
    ),
    cancel_url: absoluteUrl("/checkout?annullato=1"),
  });

  await db.update(orders).set({ stripeSessionId: session.id }).where(eq(orders.id, created.orderId));

  return NextResponse.json({ ok: true, url: session.url });
}
