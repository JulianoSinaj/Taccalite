import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Reveal from "@/components/Reveal";

/**
 * Numbered because the list is a sequence the customer actually walks: what you
 * take away today, what you have delivered, what you book ahead. Five identical
 * cards would have said none of that — and would have forced five descriptions
 * of the same length, which these are not.
 */
const servizi = [
  {
    title: "Aperitivi",
    body: "Taglieri di salumi e formaggi composti al momento su quello che c'è di buono quel giorno. Da portare via o da aprire in compagnia.",
    href: "/negozio",
    cta: "Guarda la selezione",
  },
  {
    title: "Asporto",
    body: "Gastronomia pronta, primi e secondi del giorno, olive all'ascolana appena fritte. Ordina la mattina, passi quando ti fa comodo.",
    href: "/negozio",
    cta: "Ordina online",
  },
  {
    title: "Domicilio",
    body: "Portiamo la spesa a casa ad Ancona e dintorni. Per la consegna in giornata basta chiamare entro mezzogiorno.",
    href: "/contatti",
    cta: "Chiedi la consegna",
  },
  {
    title: "Catering",
    body: "Compleanni, uffici, feste di famiglia. Prepariamo noi: dal tagliere per otto al buffet completo, concordato voce per voce.",
    href: "/contatti",
    cta: "Richiedi un preventivo",
  },
  {
    title: "Richieste speciali",
    body: "Una forma intera, un taglio che non trovi, una porchetta per cinquanta persone. Se esiste ve la troviamo, se serve tempo ve lo diciamo.",
    href: "/contatti",
    cta: "Scrivici",
  },
];

export default function Servizi() {
  return (
    <section className="bg-paper-warm px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
      <div className="mx-auto max-w-[88rem]">
        <div className="flex flex-col justify-between gap-7 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              <span aria-hidden className="h-px w-10 bg-gold" />
              Cosa facciamo per voi
            </p>
            <h2 className="font-display display-lg mt-7 max-w-2xl font-semibold text-brown-950">
              I nostri <span className="wonk text-gold-deep">servizi</span>
            </h2>
          </div>
          <p className="max-w-sm text-base leading-relaxed text-brown-700">
            Oltre al banco: quello che possiamo preparare, consegnare o tenere da parte
            per voi.
          </p>
        </div>

        <ol className="mt-14 border-t border-rule">
          {servizi.map((servizio, i) => (
            <Reveal key={servizio.title} delay={i * 0.05}>
              <li className="border-b border-rule">
                <Link
                  href={servizio.href}
                  className="group relative grid items-baseline gap-x-8 gap-y-3 py-9 transition-colors focus-visible:outline-none md:grid-cols-[4rem_minmax(0,15rem)_1fr_auto] md:py-11"
                >
                  <span className="font-display text-[0.9375rem] font-semibold text-gold-deep tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <h3 className="font-display text-[1.75rem] leading-none font-semibold tracking-[-0.025em] text-brown-950 transition-colors group-hover:text-gold-deep md:text-[2.125rem]">
                    {servizio.title}
                  </h3>

                  <p className="max-w-xl text-base leading-relaxed text-brown-700">
                    {servizio.body}
                  </p>

                  <span className="flex items-center gap-2.5 text-[0.6875rem] font-semibold tracking-[0.18em] text-brown-950 uppercase transition-[gap] duration-500 group-hover:gap-4">
                    {servizio.cta}
                    <ArrowUpRight className="size-4 text-gold-deep" aria-hidden />
                  </span>

                  <span
                    aria-hidden
                    className="rule-draw pointer-events-none absolute inset-x-0 -bottom-px h-px"
                  />
                </Link>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
