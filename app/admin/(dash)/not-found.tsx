import Link from "next/link";

/**
 * The record an operator asked for is gone.
 *
 * Without this file `notFound()` from any admin page walked all the way up to
 * `app/not-found.tsx` — the *storefront* 404, whose only ways out are "Torna
 * alla home" and `/sedi`. A bookmarked order that was since cancelled, or an id
 * mistyped in the address bar, therefore ejected the operator from the
 * gestionale onto the public site with no link back. Sitting inside the `(dash)`
 * segment, this one renders within the admin layout instead, so the sidebar,
 * the search palette and every other destination stay exactly where they were.
 */
export default function AdminNotFound() {
  return (
    <div className="rounded-2xl border border-brown-950/10 bg-surface/60 p-8 text-center">
      <h1 className="font-display text-2xl text-brown-950">Questa scheda non esiste più</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-brown-900/70">
        L&apos;indirizzo è corretto ma il record non c&apos;è: può essere stato eliminato, oppure il
        link che hai seguito è vecchio. Cerca la scheda dal menu qui a fianco, o con la ricerca
        rapida.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-6 py-2.5 text-[12px] font-bold tracking-widest text-cream uppercase transition-colors hover:bg-brown-900"
        >
          Torna alla dashboard
        </Link>
        <Link
          href="/admin/orders"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-6 py-2.5 text-[12px] font-bold tracking-widest text-brown-950 uppercase transition-colors hover:bg-brown-900/15"
        >
          Ordini
        </Link>
        <Link
          href="/admin/reservations"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-6 py-2.5 text-[12px] font-bold tracking-widest text-brown-950 uppercase transition-colors hover:bg-brown-900/15"
        >
          Prenotazioni
        </Link>
        <Link
          href="/admin/products"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-6 py-2.5 text-[12px] font-bold tracking-widest text-brown-950 uppercase transition-colors hover:bg-brown-900/15"
        >
          Prodotti
        </Link>
      </div>
    </div>
  );
}
