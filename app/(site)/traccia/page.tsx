import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  getReservationByReference,
  getShopBySlug,
  getOrderByNumberAndEmail,
} from "@/lib/db/queries";
import { formatEuro } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Traccia il tuo ordine o prenotazione",
  robots: { index: false, follow: false },
};

type SearchParams = {
  searchParams: Promise<{ ref?: string; order?: string; email?: string; t?: string }>;
};

const TYPE_LABEL: Record<"table" | "porchetta" | "order", string> = {
  table: "Tavolo / degustazione",
  porchetta: "Porchetta del sabato",
  order: "Ordine speciale",
};

const STATUS_LABEL: Record<"pending" | "confirmed" | "completed" | "cancelled", string> = {
  pending: "In attesa di conferma",
  confirmed: "Confermata",
  completed: "Completata",
  cancelled: "Annullata",
};

const STATUS_STYLE: Record<"pending" | "confirmed" | "completed" | "cancelled", string> = {
  pending: "bg-gold/20 text-brown-950",
  confirmed: "bg-gold text-brown-950",
  completed: "bg-brown-950 text-cream",
  cancelled: "bg-red-500/15 text-red-700",
};

type OrderStatus = "pending" | "paid" | "fulfilled" | "cancelled" | "refunded";
const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "In attesa di pagamento",
  paid: "Pagato",
  fulfilled: "Evaso",
  cancelled: "Annullato",
  refunded: "Rimborsato",
};
const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-gold/20 text-brown-950",
  paid: "bg-gold text-brown-950",
  fulfilled: "bg-brown-950 text-cream",
  cancelled: "bg-red-500/15 text-red-700",
  refunded: "bg-red-500/15 text-red-700",
};

const FULFILMENT_LABEL: Record<"pickup" | "shipping", string> = {
  pickup: "Ritiro in bottega",
  shipping: "Spedizione",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-brown-900/10 py-2.5 last:border-0">
      <dt className="text-sm text-brown-900/60">{label}</dt>
      <dd className="text-right text-sm font-medium text-brown-950">{value}</dd>
    </div>
  );
}

function BackHome() {
  return (
    <div className="mt-8 text-center">
      <Link
        href="/traccia"
        className="inline-flex rounded-full bg-brown-950 px-8 py-3.5 text-sm font-semibold text-cream transition-colors hover:bg-brown-900"
      >
        Nuova ricerca
      </Link>
    </div>
  );
}

const tabBase =
  "flex-1 rounded-full px-5 py-2.5 text-center text-xs font-bold tracking-widest uppercase transition-colors";

function LookupForms({
  tab,
  reservationNotFound,
  orderNotFound,
  refCode,
  order,
  email,
}: {
  tab: "reservation" | "order";
  reservationNotFound?: boolean;
  orderNotFound?: boolean;
  refCode?: string;
  order?: string;
  email?: string;
}) {
  return (
    <section className="flex min-h-[80vh] items-center justify-center bg-cream px-5 pt-32 pb-20">
      <div className="w-full max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brown-900/50">
          Norcineria Taccalite
        </p>
        <h1 className="mt-4 font-display text-4xl tracking-tighter text-brown-950 sm:text-5xl">
          Traccia il tuo ordine
        </h1>
        <p className="mt-4 text-lg text-brown-900/75">
          Controlla lo stato di una prenotazione o di un ordine dell&apos;e-shop.
        </p>

        {/* Tabs */}
        <div className="mx-auto mt-8 flex max-w-md gap-2 rounded-full border border-brown-900/10 bg-white/60 p-1">
          <Link
            href="/traccia?t=reservation"
            className={`${tabBase} ${
              tab === "reservation" ? "bg-brown-950 text-cream" : "text-brown-900/60 hover:text-brown-950"
            }`}
          >
            Prenotazione
          </Link>
          <Link
            href="/traccia?t=order"
            className={`${tabBase} ${
              tab === "order" ? "bg-brown-950 text-cream" : "text-brown-900/60 hover:text-brown-950"
            }`}
          >
            Ordine e-shop
          </Link>
        </div>

        {tab === "reservation" ? (
          <form method="get" className="mx-auto mt-8 w-full max-w-md text-left">
            {reservationNotFound && (
              <p className="mb-5 rounded-2xl bg-red-500/10 px-5 py-3.5 text-sm text-red-700">
                Nessuna prenotazione trovata con questo riferimento. Controlla il codice
                nella tua email di conferma e riprova.
              </p>
            )}
            <label htmlFor="ref" className="eyebrow eyebrow-dark mb-1.5 block">
              Riferimento prenotazione
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="ref"
                type="text"
                name="ref"
                required
                defaultValue={refCode ?? ""}
                placeholder="Es. TAC-3F9K2"
                aria-label="Riferimento prenotazione"
                className="flex-1 rounded-full border border-brown-900/15 bg-white/70 px-6 py-3.5 text-sm text-brown-950 placeholder:text-brown-900/40 focus:border-gold focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brown-950 px-8 py-3.5 text-sm font-semibold text-cream transition-colors hover:bg-brown-900"
              >
                <Search className="size-4" />
                Cerca
              </button>
            </div>
          </form>
        ) : (
          <form method="get" className="mx-auto mt-8 w-full max-w-md space-y-4 text-left">
            <input type="hidden" name="t" value="order" />
            {orderNotFound && (
              <p className="rounded-2xl bg-red-500/10 px-5 py-3.5 text-sm text-red-700">
                Nessun ordine trovato con questo numero ed email. Controlla i dati
                nella tua email di conferma e riprova.
              </p>
            )}
            <div>
              <label htmlFor="order" className="eyebrow eyebrow-dark mb-1.5 block">
                Numero ordine
              </label>
              <input
                id="order"
                type="text"
                name="order"
                required
                defaultValue={order ?? ""}
                placeholder="Es. ORD-2026-0042"
                aria-label="Numero ordine"
                className="w-full rounded-full border border-brown-900/15 bg-white/70 px-6 py-3.5 text-sm text-brown-950 placeholder:text-brown-900/40 focus:border-gold focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="email" className="eyebrow eyebrow-dark mb-1.5 block">
                Email dell&apos;ordine
              </label>
              <input
                id="email"
                type="email"
                name="email"
                required
                defaultValue={email ?? ""}
                placeholder="La tua email"
                aria-label="Email dell'ordine"
                className="w-full rounded-full border border-brown-900/15 bg-white/70 px-6 py-3.5 text-sm text-brown-950 placeholder:text-brown-900/40 focus:border-gold focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brown-950 px-8 py-3.5 text-sm font-semibold text-cream transition-colors hover:bg-brown-900"
            >
              <Search className="size-4" />
              Cerca l&apos;ordine
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

export default async function TracciaPage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const reference = sp.ref?.trim();
  const orderNumber = sp.order?.trim();
  const email = sp.email?.trim();

  // Which tab is active. An explicit lookup forces its own tab.
  const tab: "reservation" | "order" =
    orderNumber || email || sp.t === "order" ? "order" : "reservation";

  // ── Order lookup (email is the bearer proof — never show without a match). ──
  if (tab === "order") {
    const result =
      orderNumber && email ? await getOrderByNumberAndEmail(orderNumber, email) : null;

    if (!result) {
      return (
        <LookupForms
          tab="order"
          orderNotFound={Boolean(orderNumber && email)}
          order={orderNumber}
          email={email}
        />
      );
    }

    const { order, items } = result;
    const statusLabel = ORDER_STATUS_LABEL[order.status as OrderStatus];
    const statusStyle = ORDER_STATUS_STYLE[order.status as OrderStatus];

    return (
      <section className="flex min-h-[80vh] items-center justify-center bg-cream px-5 pt-32 pb-20">
        <div className="w-full max-w-lg">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brown-900/50">
              Il tuo ordine
            </p>
            <h1 className="mt-4 font-display text-4xl tracking-tighter text-brown-950 sm:text-5xl">
              {order.orderNumber}
            </h1>
            <div className="mt-6">
              <span className={`inline-flex rounded-full px-5 py-2 text-sm font-semibold ${statusStyle}`}>
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="mt-10 space-y-2 rounded-[24px] border border-brown-900/10 bg-white/70 p-6">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-4 border-b border-brown-900/10 py-2.5 last:border-0"
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-brown-950">{it.name}</p>
                  <p className="text-xs text-brown-900/55">
                    {it.quantity} × {formatEuro(it.unitPriceCents)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-brown-950">
                  {formatEuro(it.lineTotalCents)}
                </p>
              </div>
            ))}
          </div>

          <dl className="mt-4 space-y-1 rounded-[24px] border border-brown-900/10 bg-white/70 p-6">
            <Row label="Consegna" value={FULFILMENT_LABEL[order.fulfilment]} />
            <Row label="Subtotale" value={formatEuro(order.subtotalCents)} />
            {order.shippingCents > 0 && (
              <Row label="Spedizione" value={formatEuro(order.shippingCents)} />
            )}
            <div className="flex items-center justify-between gap-4 pt-2">
              <dt className="font-display text-lg font-bold text-brown-950">Totale</dt>
              <dd className="font-display text-lg font-bold text-brown-950">
                {formatEuro(order.totalCents)}
              </dd>
            </div>
          </dl>

          <p className="mt-6 text-center text-sm text-brown-900/60">
            Conserva il numero d&apos;ordine e l&apos;email di conferma. Per assistenza rispondi
            a quella email o contatta il negozio.
          </p>

          <BackHome />
        </div>
      </section>
    );
  }

  // ── Reservation lookup (existing behaviour). ──
  const reservation = reference ? await getReservationByReference(reference) : null;

  if (!reservation) {
    return <LookupForms tab="reservation" reservationNotFound={Boolean(reference)} refCode={reference} />;
  }

  const shop = await getShopBySlug(reservation.shopSlug);
  const statusLabel = STATUS_LABEL[reservation.status];
  const statusStyle = STATUS_STYLE[reservation.status];

  return (
    <section className="flex min-h-[80vh] items-center justify-center bg-cream px-5 pt-32 pb-20">
      <div className="w-full max-w-lg">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brown-900/50">
            La tua prenotazione
          </p>
          <h1 className="mt-4 font-display text-4xl tracking-tighter text-brown-950 sm:text-5xl">
            {TYPE_LABEL[reservation.type]}
          </h1>
          <div className="mt-6 flex flex-col items-center gap-2">
            <span className={`inline-flex rounded-full px-5 py-2 text-sm font-semibold ${statusStyle}`}>
              {statusLabel}
            </span>
            {reservation.waitlisted && reservation.status !== "cancelled" && (
              <span className="text-sm font-medium text-brown-900/70">In lista d&apos;attesa</span>
            )}
          </div>
        </div>

        <dl className="mt-10 space-y-1 rounded-[24px] border border-brown-900/10 bg-white/70 p-6">
          <Row label="Riferimento" value={reservation.reference} />
          {shop && <Row label="Negozio" value={shop.name} />}
          {reservation.date && (
            <Row
              label="Data"
              value={
                reservation.time ? `${reservation.date} · ${reservation.time}` : reservation.date
              }
            />
          )}
          {reservation.quantityKg != null && (
            <Row label="Quantità" value={`${reservation.quantityKg} kg`} />
          )}
          <Row label="Nome" value={reservation.name} />
        </dl>

        <p className="mt-6 text-center text-sm text-brown-900/60">
          Per qualsiasi modifica, rispondi alla email di conferma o contatta il negozio.
        </p>

        <BackHome />
      </div>
    </section>
  );
}
