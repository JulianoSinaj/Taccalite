import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-cream px-6 py-24 text-brown-950">
      <div className="mx-auto max-w-md text-center">
        <p className="text-xs font-bold tracking-widest text-gold-deep uppercase">Errore 404</p>
        <h1 className="font-display mt-3 text-4xl text-brown-950">Pagina non trovata</h1>
        <p className="mt-4 text-brown-900/70">
          La pagina che cerchi non esiste o è stata spostata. Torna alla home o scopri le nostre
          botteghe.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-[11px] font-bold tracking-widest text-brown-950 uppercase transition-colors hover:bg-gold-dark"
          >
            Torna alla home
          </Link>
          <Link
            href="/negozi"
            className="inline-flex items-center gap-2 rounded-full border border-brown-950/15 px-6 py-3 text-[11px] font-bold tracking-widest text-brown-900 uppercase transition-colors hover:bg-brown-950/5"
          >
            Le botteghe
          </Link>
        </div>
      </div>
    </main>
  );
}
