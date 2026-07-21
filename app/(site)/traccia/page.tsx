import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { getReservationByReference, getShopBySlug } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Traccia la tua prenotazione",
  robots: { index: false, follow: false },
};

type SearchParams = { searchParams: Promise<{ ref?: string }> };

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

function SearchForm({ notFound }: { notFound?: boolean }) {
  return (
    <form method="get" className="mx-auto mt-8 w-full max-w-md">
      {notFound && (
        <p className="mb-5 rounded-2xl bg-red-500/10 px-5 py-3.5 text-sm text-red-700">
          Nessuna prenotazione trovata con questo riferimento. Controlla il codice
          nella tua email di conferma e riprova.
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          name="ref"
          required
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
  );
}

export default async function TracciaPage({ searchParams }: SearchParams) {
  const { ref } = await searchParams;
  const reference = ref?.trim();

  const reservation = reference ? await getReservationByReference(reference) : null;

  // No ref supplied → just the lookup form. Ref supplied but no match → form + note.
  if (!reservation) {
    return (
      <section className="flex min-h-[80vh] items-center justify-center bg-cream px-5 pt-32 pb-20">
        <div className="w-full max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brown-900/50">
            Norcineria Taccalite
          </p>
          <h1 className="mt-4 font-display text-4xl tracking-tighter text-brown-950 sm:text-5xl">
            Traccia la tua prenotazione
          </h1>
          <p className="mt-4 text-lg text-brown-900/75">
            Inserisci il codice di riferimento che trovi nella email di conferma per
            vedere lo stato della tua prenotazione.
          </p>
          <SearchForm notFound={Boolean(reference)} />
        </div>
      </section>
    );
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
            <span
              className={`inline-flex rounded-full px-5 py-2 text-sm font-semibold ${statusStyle}`}
            >
              {statusLabel}
            </span>
            {reservation.waitlisted && reservation.status !== "cancelled" && (
              <span className="text-sm font-medium text-brown-900/70">
                In lista d&apos;attesa
              </span>
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
                reservation.time
                  ? `${reservation.date} · ${reservation.time}`
                  : reservation.date
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

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex rounded-full bg-brown-950 px-8 py-3.5 text-sm font-semibold text-cream transition-colors hover:bg-brown-900"
          >
            Torna alla home
          </Link>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-brown-900/10 py-2.5 last:border-0">
      <dt className="text-sm text-brown-900/60">{label}</dt>
      <dd className="text-right text-sm font-medium text-brown-950">{value}</dd>
    </div>
  );
}
