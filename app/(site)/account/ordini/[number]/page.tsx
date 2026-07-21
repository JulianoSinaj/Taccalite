import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrderForViewer } from "@/lib/orders";
import { getShopBySlug } from "@/lib/db/queries";
import { formatEuro } from "@/lib/format";

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

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-brown-900/10 text-brown-800",
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Non pagato",
  paid: "Pagamento ricevuto",
  refunded: "Rimborsato",
};

const PAYMENT_STYLE: Record<string, string> = {
  unpaid: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  refunded: "bg-brown-900/10 text-brown-800",
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
    order.fulfilment === "pickup" && order.shopSlug ? await getShopBySlug(order.shopSlug) : null;
  const shipping = order.shippingAddress ?? null;

  const statusLabel = STATUS_LABEL[order.status] ?? order.status;
  const statusStyle = STATUS_STYLE[order.status] ?? "bg-brown-900/10 text-brown-800";
  const paymentLabel = PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus;
  const paymentStyle = PAYMENT_STYLE[order.paymentStatus] ?? "bg-brown-900/10 text-brown-800";

  return (
    <section className="min-h-[80vh] bg-cream px-5 pt-32 pb-20 sm:px-10">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/account"
          className="inline-flex items-center gap-2 text-sm font-semibold text-brown-900/70 transition-colors hover:text-brown-950"
        >
          <ArrowLeft className="size-4" />
          Torna all&apos;area personale
        </Link>

        <header className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brown-900/50">
            Il tuo ordine
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tighter text-brown-950 sm:text-5xl">
            {order.orderNumber}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest ${statusStyle}`}
            >
              {statusLabel}
            </span>
            <span
              className={`inline-flex rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest ${paymentStyle}`}
            >
              {paymentLabel}
            </span>
          </div>
          {order.createdAt && (
            <p className="mt-4 text-sm text-brown-900/60">
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
        <div className="mt-10 rounded-[24px] border border-brown-900/10 bg-white/70 p-6 sm:p-8">
          <h2 className="font-display text-2xl tracking-tight text-brown-950">Prodotti</h2>
          <ul className="mt-5 divide-y divide-brown-900/10">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-brown-950">{it.name}</p>
                  <p className="text-xs text-brown-800/60">
                    {it.quantity} × {formatEuro(it.unitPriceCents)}
                  </p>
                </div>
                <span className="font-display text-lg font-bold text-brown-950 tabular-nums">
                  {formatEuro(it.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-2 border-t border-brown-900/10 pt-5">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-brown-900/60">Subtotale</dt>
              <dd className="text-sm font-medium text-brown-950 tabular-nums">
                {formatEuro(order.subtotalCents)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-brown-900/60">Spedizione</dt>
              <dd className="text-sm font-medium text-brown-950 tabular-nums">
                {order.shippingCents > 0 ? formatEuro(order.shippingCents) : "Gratis"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-brown-900/10 pt-3">
              <dt className="font-display text-lg text-brown-950">Totale</dt>
              <dd className="font-display text-xl font-bold text-brown-950 tabular-nums">
                {formatEuro(order.totalCents)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Fulfilment */}
        <div className="mt-6 rounded-[24px] border border-brown-900/10 bg-white/70 p-6 sm:p-8">
          <h2 className="font-display text-2xl tracking-tight text-brown-950">
            {order.fulfilment === "pickup" ? "Ritiro in negozio" : "Spedizione"}
          </h2>
          {order.fulfilment === "pickup" ? (
            <p className="mt-3 text-sm leading-relaxed text-brown-900/75">
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
            <address className="mt-3 text-sm not-italic leading-relaxed text-brown-900/75">
              <span className="font-semibold text-brown-950">{order.name}</span>
              <br />
              {shipping.address}
              <br />
              {shipping.zip} {shipping.city}
            </address>
          ) : (
            <p className="mt-3 text-sm text-brown-900/75">Consegna al tuo indirizzo.</p>
          )}
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="mt-6 rounded-[24px] border border-brown-900/10 bg-white/70 p-6 sm:p-8">
            <h2 className="font-display text-2xl tracking-tight text-brown-950">Note</h2>
            <p className="mt-3 text-sm leading-relaxed text-brown-900/75">{order.notes}</p>
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
