import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { finalizeOrder, getOrderForViewer } from "@/lib/orders";
import { getStripe } from "@/lib/payments/stripe";
import { getCurrentUser } from "@/lib/auth/session";
import { formatEuro } from "@/lib/format";
import { settlesOnHandover } from "@/lib/payments/methods";
import ClearCart from "@/components/store/ClearCart";
import ClaimOrderOffer from "@/components/store/ClaimOrderOffer";
import { getSetting } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ordine confermato",
  robots: { index: false, follow: false },
};

type SP = { searchParams: Promise<{ order?: string; session?: string; token?: string; sim?: string }> };

export default async function CheckoutSuccess({ searchParams }: SP) {
  const { order: orderNumber, session, token } = await searchParams;

  // With real Stripe, verify the session server-side and finalize (idempotent).
  // The verified orderId also entitles this viewer to see the order details.
  let verifiedOrderId: string | null = null;
  const stripe = getStripe();
  if (session && stripe) {
    try {
      const s = await stripe.checkout.sessions.retrieve(session);
      if (s.payment_status === "paid" && s.metadata?.orderId) {
        verifiedOrderId = s.metadata.orderId;
        await finalizeOrder(s.metadata.orderId, {
          paymentIntentId:
            typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
        });
      }
    } catch {
      /* ignore — webhook is the backstop */
    }
  }

  const viewer = await getCurrentUser();
  const result = await getOrderForViewer(orderNumber, {
    token,
    verifiedOrderId,
    viewerUserId: viewer?.id ?? null,
  });
  const order = result?.order ?? null;
  const items = result?.items ?? [];

  // The offer only makes sense for an order nobody owns yet, and only to a
  // viewer entitled to see the order at all (`getOrderForViewer` already
  // decided that — a null `order` means no token, no verified session, no
  // ownership, so there is nothing to claim).
  const claimable = !!order && !order.userId;
  const loyaltyEnabled = claimable ? await getSetting<boolean>("loyalty.enabled", true) : false;
  const perEuro = loyaltyEnabled ? ((await getSetting<number>("loyalty.pointsPerEuro", 1)) || 1) : 0;
  // Only a settled order would actually credit points, so don't quote a number
  // for one still awaiting payment at the counter.
  const claimPoints =
    loyaltyEnabled && order?.paymentStatus === "paid"
      ? Math.floor((order.subtotalCents / 100) * perEuro)
      : 0;
  const awaitingPayment = !!order && order.paymentStatus === "unpaid" && settlesOnHandover(order.paymentMethod);

  return (
    <section className="flex min-h-[70svh] items-center justify-center bg-cream px-5 pt-28 pb-16">
      <ClearCart />
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-gold">
          <Check className="size-8 text-brown-950" />
        </div>
        <h1 className="font-display display-lg font-semibold text-brown-950">Grazie!</h1>
        <p className="mt-4 text-lg text-brown-700">
          {order
            ? `Il tuo ordine ${order.orderNumber} è stato registrato. Ti abbiamo inviato una email di conferma.`
            : "Il tuo ordine è stato registrato."}
        </p>

        {/* An order paid on handover is not a completed purchase, and this page
            is the last thing the customer reads before closing the tab. Say what
            is still owed, and where, rather than letting "Grazie!" imply the
            money has already changed hands. */}
        {order && awaitingPayment && (
          <p className="mt-6 border border-gold-dark/40 bg-gold/15 px-5 py-4 text-left text-sm text-brown-900">
            <span className="block font-semibold text-brown-950">
              Da pagare {order.paymentMethod === "on_delivery" ? "alla consegna" : "al ritiro"}:{" "}
              {formatEuro(order.totalCents)}
            </span>
            <span className="mt-1 block text-brown-700">
              Nessun addebito è stato effettuato online. Puoi pagare in contanti o con il POS.
            </span>
          </p>
        )}

        {order && items.length > 0 && (
          <div className="mt-8 border border-rule bg-paper-warm p-6 text-left">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between py-1.5 text-sm text-brown-700">
                <span>{i.quantity}× {i.name}</span>
                <span>{formatEuro(i.lineTotalCents)}</span>
              </div>
            ))}
            <div className="mt-3 flex justify-between border-t border-rule pt-3 font-display text-lg font-bold text-brown-950">
              <span>Totale</span>
              <span>{formatEuro(order.totalCents)}</span>
            </div>
          </div>
        )}

        {claimable && order && (
          <ClaimOrderOffer
            orderId={order.id}
            email={order.email}
            points={claimPoints}
            signedIn={!!viewer}
          />
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
