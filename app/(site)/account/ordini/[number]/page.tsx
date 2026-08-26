import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/orders";
import { getShopBySlug } from "@/lib/db/queries";
import { formatEuro } from "@/lib/format";
import { trackingUrlFor } from "@/lib/carriers";
import StatusChip, { TONE, type Tone } from "@/components/account/StatusChip";

import { FULFILMENT_LABEL } from "@/lib/fulfilment";
import { settlesOnHandover } from "@/lib/payments/methods";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dettaglio ordine",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "In attesa",
  paid: "Pagato",
  fulfilled: "Consegnato",
  cancelled: "Annullato",
  refunded: "Rimborsato",
};

// Same tones as the dashboard that links here, drawn by the same chip — an
// order should not change colour language between the list and its own page.
const STATUS_STYLE: Record<string, Tone> = {
  pending: TONE.waiting,
  paid: TONE.good,
  fulfilled: TONE.good,
  cancelled: TONE.bad,
  refunded: TONE.neutral,
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Non pagato",
  paid: "Pagamento ricevuto",
  refunded: "Rimborsato",
};

const PAYMENT_STYLE: Record<string, Tone> = {
  unpaid: TONE.waiting,
  paid: TONE.good,
  refunded: TONE.neutral,
};

type PageProps = { params: Promise<{ number: string }> };

export default async function OrderDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/account");

  const { number } = await params;
  const data = await getOrderForViewer(decodeURIComponent(number), { viewerUserId: user.id });
  if (!data) notFound();

  const { order, items } = data;
  const shop =
    order.fulfilment !== "shipping" && order.shopSlug ? await getShopBySlug(order.shopSlug) : null;
  const shipping = order.shippingAddress ?? null;
  const trackingHref = await trackingUrlFor(order.carrier, order.trackingNumber);

  const statusLabel = STATUS_LABEL[order.status] ?? order.status;
  const statusStyle = STATUS_STYLE[order.status] ?? TONE.neutral;
  // "Non pagato" reads like a problem. For an order the customer chose to settle
  // on collection it is simply the arrangement, so say which one it is.
  const awaitingPayment =
    order.paymentStatus === "unpaid" &&
    order.status !== "cancelled" &&
    settlesOnHandover(order.paymentMethod);
  const paymentLabel = awaitingPayment
    ? order.paymentMethod === "on_delivery"
      ? "Da pagare alla consegna"
      : "Da pagare al ritiro"
    : PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus;
  const paymentStyle = PAYMENT_STYLE[order.paymentStatus] ?? TONE.neutral;

  return (
    <section className="min-h-[70svh] bg-cream px-5 pt-28 pb-16 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/account"
          className="inline-flex items-center gap-2 text-sm font-semibold text-brown-700 transition-colors hover:text-brown-950"
        >
          <ArrowLeft className="size-4" />
          Torna all&apos;area personale
        </Link>

        <header className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-taupe">
            Il tuo ordine
          </p>
          <h1 className="mt-3 font-display display-lg font-semibold text-brown-950">
            {order.orderNumber}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <StatusChip tone={statusStyle} className="px-4 py-1.5 text-[0.6875rem]">
              {statusLabel}
            </StatusChip>
            <StatusChip tone={paymentStyle} className="px-4 py-1.5 text-[0.6875rem]">
              {paymentLabel}
            </StatusChip>
          </div>
          {awaitingPayment && (
            <p className="mt-5 border border-gold-dark/40 bg-gold/15 px-5 py-4 text-sm text-brown-900">
              <span className="block font-semibold text-brown-950">
                Da pagare {order.paymentMethod === "on_delivery" ? "alla consegna" : "al ritiro"}:{" "}
                {formatEuro(order.totalCents)}
              </span>
              <span className="mt-1 block text-brown-700">
                Nessun addebito è stato effettuato online. Puoi pagare in contanti o con il POS.
              </span>
            </p>
          )}
          {order.createdAt && (
            <p className="mt-4 text-sm text-brown-700">
              Effettuato il{" "}
              {new Date(order.createdAt).toLocaleDateString("it-IT", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </header>

        {/* Line items */}
        <div className="mt-10 border border-rule bg-paper-warm p-6 sm:p-8">
          <h2 className="font-display text-2xl tracking-tight text-brown-950">Prodotti</h2>
          <ul className="mt-5 divide-y divide-rule">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-brown-950">{it.name}</p>
                  <p className="text-xs text-taupe">
                    {it.quantity} × {formatEuro(it.unitPriceCents)}
                  </p>
                </div>
                <span className="font-display text-lg font-bold text-brown-950 tabular-nums">
                  {formatEuro(it.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-2 border-t border-rule pt-5">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-brown-700">Subtotale</dt>
              <dd className="text-sm font-medium text-brown-950 tabular-nums">
                {formatEuro(order.subtotalCents)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-brown-700">Spedizione</dt>
              <dd className="text-sm font-medium text-brown-950 tabular-nums">
                {order.shippingCents > 0 ? formatEuro(order.shippingCents) : "Gratis"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-rule pt-3">
              <dt className="font-display text-lg text-brown-950">Totale</dt>
              <dd className="font-display text-xl font-bold text-brown-950 tabular-nums">
                {formatEuro(order.totalCents)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Fulfilment */}
        <div className="mt-6 border border-rule bg-paper-warm p-6 sm:p-8">
          <h2 className="font-display text-2xl tracking-tight text-brown-950">
            {FULFILMENT_LABEL[order.fulfilment]}
          </h2>
          {order.fulfilment === "pickup" ? (
            <p className="mt-3 text-sm leading-relaxed text-brown-700">
              {shop ? (
                <>
                  Ritiro presso <span className="font-semibold text-brown-950">{shop.name}</span>
                  {shop.address ? `, ${shop.address}` : ""}.
                </>
              ) : (
                "Ritiro in negozio."
              )}
            </p>
          ) : shipping ? (
            <address className="mt-3 text-sm not-italic leading-relaxed text-brown-700">
              <span className="font-semibold text-brown-950">{order.name}</span>
              <br />
              {shipping.address}
              <br />
              {shipping.zip} {shipping.city}
            </address>
          ) : (
            <p className="mt-3 text-sm text-brown-700">Consegna al tuo indirizzo.</p>
          )}
          {order.fulfilment === "shipping" && order.trackingNumber && (
            <p className="mt-4 border-t border-rule pt-4 text-sm text-brown-700">
              Tracking:{" "}
              {order.carrier ? <span className="text-brown-950">{order.carrier} · </span> : null}
              {trackingHref ? (
                <a
                  href={trackingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-gold-deep underline"
                >
                  {order.trackingNumber}
                </a>
              ) : (
                <span className="font-semibold text-brown-950">{order.trackingNumber}</span>
              )}
            </p>
          )}
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="mt-6 border border-rule bg-paper-warm p-6 sm:p-8">
            <h2 className="font-display text-2xl tracking-tight text-brown-950">Note</h2>
            <p className="mt-3 text-sm leading-relaxed text-brown-700">{order.notes}</p>
          </div>
        )}

        <div className="mt-10 text-center">
          <Link
            href="/account"
            className="inline-flex rounded-full bg-brown-950 px-8 py-3.5 text-sm font-semibold text-cream transition-colors hover:bg-brown-900"
          >
            Torna all&apos;area personale
          </Link>
        </div>
      </div>
    </section>
  );
}
