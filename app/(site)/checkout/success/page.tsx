import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems } from "@/lib/db/schema";
import { finalizeOrder } from "@/lib/orders";
import { getStripe } from "@/lib/payments/stripe";
import { formatEuro } from "@/lib/format";
import ClearCart from "@/components/store/ClearCart";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ordine confermato",
  robots: { index: false, follow: false },
};

type SP = { searchParams: Promise<{ order?: string; session?: string; sim?: string }> };

export default async function CheckoutSuccess({ searchParams }: SP) {
  const { order: orderNumber, session } = await searchParams;

  // With real Stripe, verify the session server-side and finalize (idempotent).
  const stripe = getStripe();
  if (session && stripe) {
    try {
      const s = await stripe.checkout.sessions.retrieve(session);
      if (s.payment_status === "paid" && s.metadata?.orderId) {
        await finalizeOrder(s.metadata.orderId);
      }
    } catch {
      /* ignore — webhook is the backstop */
    }
  }

  const [order] = orderNumber
    ? await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1)
    : [];
  const items = order ? await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)) : [];

  return (
    <section className="flex min-h-[80vh] items-center justify-center bg-cream px-5 pt-32 pb-20">
      <ClearCart />
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-gold">
          <Check className="size-8 text-brown-950" />
        </div>
        <h1 className="font-display text-4xl tracking-tighter text-brown-950 sm:text-5xl">Grazie!</h1>
        <p className="mt-4 text-lg text-brown-900/75">
          {order
            ? `Il tuo ordine ${order.orderNumber} è stato registrato. Ti abbiamo inviato una email di conferma.`
            : "Il tuo ordine è stato registrato."}
        </p>

        {order && items.length > 0 && (
          <div className="mt-8 rounded-[24px] border border-brown-900/10 bg-white/70 p-6 text-left">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between py-1.5 text-sm text-brown-900/80">
                <span>{i.quantity}× {i.name}</span>
                <span>{formatEuro(i.lineTotalCents)}</span>
              </div>
            ))}
            <div className="mt-3 flex justify-between border-t border-brown-900/10 pt-3 font-display text-lg font-bold text-brown-950">
              <span>Totale</span>
              <span>{formatEuro(order.totalCents)}</span>
            </div>
          </div>
        )}

        <Link
          href="/negozio"
          className="mt-8 inline-flex rounded-full bg-brown-950 px-8 py-3.5 text-sm font-semibold text-cream hover:bg-brown-900"
        >
          Continua lo shopping
        </Link>
      </div>
    </section>
  );
}
