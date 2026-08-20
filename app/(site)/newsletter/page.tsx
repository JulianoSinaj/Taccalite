import type { Metadata } from "next";
import Link from "next/link";
import { Check, X } from "lucide-react";

export const metadata: Metadata = {
  title: "Newsletter",
  robots: { index: false, follow: false },
};

type SearchParams = { searchParams: Promise<{ stato?: string }> };

export default async function NewsletterStatusPage({ searchParams }: SearchParams) {
  const { stato } = await searchParams;
  const confirmed = stato === "confermato";
  const unsubscribed = stato === "disiscritto";

  if (unsubscribed) {
    return (
      <section className="flex min-h-[60svh] items-center justify-center px-5 py-24 text-center sm:py-40">
        <div className="mx-auto max-w-lg">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-gold">
            <Check className="size-8 text-on-gold" />
          </div>
          <h1 className="font-display display-md font-semibold text-brown-950">
            Iscrizione annullata
          </h1>
          <p className="mt-6 text-lg text-brown-700">
            Non riceverai più le nostre email. Ci dispiace vederti andare — puoi iscriverti di
            nuovo quando vuoi.
          </p>
          <Link
            href="/"
            className="mt-10 inline-flex rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-brown-950 transition-colors hover:bg-gold-dark"
          >
            Torna alla home
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[60svh] items-center justify-center px-5 py-24 text-center sm:py-40">
      <div className="mx-auto max-w-lg">
        <div
          className={`mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full ${
 confirmed ? "bg-gold" : "bg-danger-soft"
 }`}
        >
          {confirmed ? (
            <Check className="size-8 text-on-gold" />
          ) : (
            <X className="size-8 text-danger" />
          )}
        </div>
        <h1 className="font-display display-md font-semibold text-brown-950">
          {confirmed ? "Iscrizione confermata" : "Link non valido"}
        </h1>
        <p className="mt-6 text-lg text-brown-700">
          {confirmed
            ? "Grazie! Riceverai le nostre novità e l'avviso quando la porchetta del sabato esce dal forno."
            : "Il link di conferma non è valido o è scaduto. Prova a iscriverti di nuovo dal fondo pagina."}
        </p>
        <Link
          href="/"
          className="mt-10 inline-flex rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-brown-950 transition-colors hover:bg-gold-dark"
        >
          Torna alla home
        </Link>
      </div>
    </section>
  );
}
